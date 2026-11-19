import type {
    GSDelayParameter,
    GSDelayProcessor
} from "../interface/gs_delay_processor";
import { DelayLine } from "./dsp/blocks/delay_line";
import { GAIN_SCALE, LEVEL_UNITY, SendInput } from "./dsp/blocks/send_input";

// SC-8850 manual p.236
// How nice of Roland to provide the conversion values to ms!
const DELAY_TIME_SEGMENTS = [
    { start: 0x01, end: 0x14, timeStart: 0.1, resolution: 0.1 },
    { start: 0x14, end: 0x23, timeStart: 2, resolution: 0.2 },
    { start: 0x23, end: 0x2d, timeStart: 5, resolution: 0.5 },
    { start: 0x2d, end: 0x37, timeStart: 10, resolution: 1 },
    { start: 0x37, end: 0x46, timeStart: 20, resolution: 2 },
    { start: 0x46, end: 0x50, timeStart: 50, resolution: 5 },
    { start: 0x50, end: 0x5a, timeStart: 100, resolution: 10 },
    { start: 0x5a, end: 0x69, timeStart: 200, resolution: 20 },
    { start: 0x69, end: 0x74, timeStart: 500, resolution: 50 }
] as const;

/**
 * The longest DELAY TIME CENTER, 1000 ms. Higher values are held there.
 */
const MAX_TIME_CENTER = 0x73;

/**
 * DELAY TIME CENTER to ms, from the segments above. Index 0 is the same 0.1 ms as 1.
 */
const TIME_CENTER_MS = new Float64Array(MAX_TIME_CENTER + 1).fill(0.1);
for (const segment of DELAY_TIME_SEGMENTS) {
    for (let value = segment.start; value < segment.end; value++) {
        TIME_CENTER_MS[value] =
            segment.timeStart + (value - segment.start) * segment.resolution;
    }
}

/**
 * The longest delay of any tap, in ms. The left and right taps stop here.
 */
const MAX_DELAY_MS = 1000;

/**
 * DELAY FEEDBACK to the loop gain per step from the center (64), -0.97 to +0.95.
 */
const FEEDBACK_STEP = 124 / 8192;

/**
 * DELAY TIME RATIO LEFT and RIGHT set their tap in steps of 100/24 % of DELAY TIME CENTER.
 */
const RATIO_STEP = 1 / 24;

/**
 * The default GS Delay implementation for {@link SpessaSynthProcessor}.
 *
 * It is modeled on the delay of the Sound Canvas (as Sound Canvas VA runs it): a mono input through a DC blocker
 * and the PRE-LPF into one delay line with three taps.
 * ```
 * input --> (+) --> delay line --+-- center --> L and R
 *            ^                   +-- left ----> L
 *            |                   +-- right ---> R
 *            +---- x feedback <-- center (previous sample)
 * ```
 * The center always feeds back, at the center time, even with LEVEL CENTER at 0 (hardware and SC-VA agree).
 * The left and right taps follow the center time through their ratios.
 * The send to reverb takes the three taps (the center once) before LEVEL, so it works even at LEVEL 0.
 *
 * @group Synthesizer.GS Effects
 */
export class DefaultGSDelay implements GSDelayProcessor {
    private readonly sampleRate;
    private readonly input;
    private readonly delayLine;
    private gain = 1;
    private reverbGain = 0;
    private feedbackGain = 0;
    private delayCenterMs = 0;
    // The tap delays, in samples
    private delayCenter = 1;
    private delayLeft = 1;
    private delayRight = 1;
    private gainCenter = 0;
    private gainLeft = 0;
    private gainRight = 0;
    /**
     * The center tap of the previous sample, which is what feeds back.
     * @private
     */
    private feedbackSample = 0;

    /**
     * Constructs a new default GS delay processor.
     * @param sampleRate The sample rate, in Hertz.
     * @param maxBufferSize The maximum buffer size the synthesizer can render at once.
     * Processing more samples than this is not supported and produces undefined output.
     */
    public constructor(sampleRate: number, maxBufferSize: number) {
        this.sampleRate = sampleRate;
        this.input = new SendInput(sampleRate);
        this.delayLine = new DelayLine(
            Math.ceil((MAX_DELAY_MS * sampleRate) / 1000)
        );
        this.reset();
        // For consistency across effects
        void maxBufferSize;
    }

    private _level = LEVEL_UNITY;

    public get level(): number {
        return this._level;
    }

    public set level(value: number) {
        this._level = value;
        this.gain = value / LEVEL_UNITY;
    }

    private _sendLevelToReverb = 0;

    public get sendLevelToReverb(): number {
        return this._sendLevelToReverb;
    }

    public set sendLevelToReverb(value: number) {
        this._sendLevelToReverb = value;
        this.reverbGain = value / GAIN_SCALE;
    }

    private _levelCenter = 0;

    public get levelCenter(): number {
        return this._levelCenter;
    }

    public set levelCenter(value: number) {
        this._levelCenter = value;
        this.gainCenter = value / GAIN_SCALE;
    }

    private _preLowpass = 0;

    public get preLowpass(): number {
        return this._preLowpass;
    }

    public set preLowpass(value: number) {
        this._preLowpass = value;
        this.input.setPreLowPass(value);
    }

    private _feedback = 64;

    public get feedback(): number {
        return this._feedback;
    }

    public set feedback(value: number) {
        // 64 is no feedback, below it the phase is inverted
        this.feedbackGain = (value - 64) * FEEDBACK_STEP;
        this._feedback = value;
    }

    private _levelRight = 0;

    public get levelRight(): number {
        return this._levelRight;
    }

    public set levelRight(value: number) {
        this._levelRight = value;
        this.gainRight = value / GAIN_SCALE;
    }

    private _timeCenter = 0;

    public get timeCenter(): number {
        return this._timeCenter;
    }

    public set timeCenter(value: number) {
        // The line holds repeats at the old time
        if (value !== this._timeCenter) this.clear();
        this._timeCenter = value;
        this.delayCenterMs =
            TIME_CENTER_MS[
                Math.max(0, Math.min(Math.round(value), MAX_TIME_CENTER))
            ];
        this.updateDelayTimes();
    }

    private _levelLeft = 0;

    public get levelLeft(): number {
        return this._levelLeft;
    }

    public set levelLeft(value: number) {
        this._levelLeft = value;
        this.gainLeft = value / GAIN_SCALE;
    }

    private _timeRatioRight = 0;

    public get timeRatioRight(): number {
        return this._timeRatioRight;
    }

    public set timeRatioRight(value: number) {
        this._timeRatioRight = value;
        this.updateDelayTimes();
    }

    private _timeRatioLeft = 0;

    public get timeRatioLeft(): number {
        return this._timeRatioLeft;
    }

    public set timeRatioLeft(value: number) {
        this._timeRatioLeft = value;
        this.updateDelayTimes();
    }

    /**
     * Process the effect and ADDS it to the output.
     * @param input The input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param outputReverb The mono input for reverb. It always starts at index 0.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix.
     */
    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        outputReverb: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        const {
            delayLine,
            gain,
            reverbGain,
            delayCenter,
            delayLeft,
            delayRight,
            feedbackGain,
            gainCenter,
            gainLeft,
            gainRight
        } = this;
        let feedbackSample = this.feedbackSample;

        for (let i = 0; i < sampleCount; i++) {
            delayLine.write(
                this.input.process(input[i]) + feedbackSample * feedbackGain
            );
            feedbackSample = delayLine.read(delayCenter);
            const center = feedbackSample * gainCenter;
            const left = delayLine.read(delayLeft) * gainLeft;
            const right = delayLine.read(delayRight) * gainRight;

            const o = startIndex + i;
            outputLeft[o] += (left + center) * gain;
            outputRight[o] += (right + center) * gain;
            outputReverb[i] += (left + right + center) * reverbGain;
        }
        this.feedbackSample = feedbackSample;
    }

    public reset() {
        this.input.clear();
        this.clear();
        // Delay 1
        this.level = LEVEL_UNITY;
        this.preLowpass = 0;
        this.timeCenter = 97;
        this.timeRatioLeft = this.timeRatioRight = 1;
        this.levelCenter = 127;
        this.levelLeft = this.levelRight = 0;
        this.feedback = 80;
        this.sendLevelToReverb = 0;
    }

    public getSnapshot(): GSDelayParameter {
        return {
            level: this._level,
            preLowpass: this._preLowpass,
            timeCenter: this._timeCenter,
            timeRatioRight: this._timeRatioRight,
            timeRatioLeft: this._timeRatioLeft,
            levelCenter: this._levelCenter,
            levelLeft: this._levelLeft,
            levelRight: this._levelRight,
            feedback: this._feedback,
            sendLevelToReverb: this._sendLevelToReverb
        };
    }

    public applySnapshot(snapshot: GSDelayParameter) {
        this.level = snapshot.level;
        this.preLowpass = snapshot.preLowpass;
        this.timeCenter = snapshot.timeCenter;
        this.timeRatioLeft = snapshot.timeRatioLeft;
        this.timeRatioRight = snapshot.timeRatioRight;
        this.levelCenter = snapshot.levelCenter;
        this.levelLeft = snapshot.levelLeft;
        this.levelRight = snapshot.levelRight;
        this.feedback = snapshot.feedback;
        this.sendLevelToReverb = snapshot.sendLevelToReverb;
    }

    private clear() {
        this.delayLine.clear();
        this.feedbackSample = 0;
    }

    private updateDelayTimes() {
        // The left and right taps follow the center time and stop at the end of the line
        const toSamples = this.sampleRate / 1000;
        const center = this.delayCenterMs;
        const left = Math.min(
            MAX_DELAY_MS,
            center * (this._timeRatioLeft * RATIO_STEP)
        );
        const right = Math.min(
            MAX_DELAY_MS,
            center * (this._timeRatioRight * RATIO_STEP)
        );
        this.delayCenter = Math.max(1, Math.round(center * toSamples));
        this.delayLeft = Math.max(1, Math.round(left * toSamples));
        this.delayRight = Math.max(1, Math.round(right * toSamples));
    }
}
