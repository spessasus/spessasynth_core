import type {
    GSChorusParameter,
    GSChorusProcessor
} from "../interface/gs_chorus_processor";
import { DelayLine } from "./dsp/blocks/delay_line";
import { LFO } from "./dsp/blocks/lfo";
import { GAIN_SCALE, LEVEL_UNITY, SendInput } from "./dsp/blocks/send_input";
import { HARDWARE_RATE } from "./dsp/hardware";

/**
 * CHORUS RATE to Hz. The LFO adds 64 x rate to a 24 bit phase every 32 kHz sample (15.5 Hz at 127).
 */
const RATE_HZ = (64 * HARDWARE_RATE) / 2 ** 24;

/**
 * CHORUS DELAY in 32 kHz samples per step (23.8 ms at 127).
 */
const DELAY_STEP = 6;

/**
 * CHORUS DEPTH in 32 kHz samples per step: what the LFO adds on top of the delay, with one step at 0
 * (20 ms at 127).
 */
const DEPTH_STEP = 5;

/**
 * The default GS Chorus implementation for {@link SpessaSynthProcessor}.
 *
 * It is modeled on the chorus of the Sound Canvas (as Sound Canvas VA runs it): a mono input through a DC blocker
 * and the PRE-LPF into one delay line, read at two places that a triangle LFO moves in opposite directions.
 * The first read is the left output and the feedback, the second one the right output.
 * The reads interpolate linearly between samples, like the Sound Canvas does at 32 kHz.
 *
 * @group Synthesizer.GS Effects
 */
export class DefaultGSChorus implements GSChorusProcessor {
    /**
     * One 32 kHz sample in host samples.
     * @private
     */
    private readonly step;
    private readonly input;
    private readonly lfo;
    private readonly delayLine;
    private gain = 1;
    private reverbGain = 0;
    private delayGain = 0;
    private feedbackGain = 0;
    // The delay at the bottom of the LFO's swing and the swing on top of it, in host samples
    private delaySamples = 0;
    private depthSamples = 0;
    /**
     * The first read of the previous sample, which is what feeds back.
     * @private
     */
    private feedbackSample = 0;

    /**
     * Constructs a new default GS chorus processor.
     * @param sampleRate The sample rate, in Hertz.
     * @param maxBufferSize The maximum buffer size the synthesizer can render at once.
     * Processing more samples than this is not supported and produces undefined output.
     */
    public constructor(sampleRate: number, maxBufferSize: number) {
        this.step = sampleRate / HARDWARE_RATE;
        this.input = new SendInput(sampleRate);
        this.lfo = new LFO(sampleRate);
        // The longest read, plus the older point of the linear read
        this.delayLine = new DelayLine(
            Math.ceil((127 * DELAY_STEP + 128 * DEPTH_STEP) * this.step) + 1
        );
        this.reset();
        // For consistency across effects
        void maxBufferSize;
    }

    private _level = LEVEL_UNITY;

    public get level() {
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

    private _sendLevelToDelay = 0;

    public get sendLevelToDelay(): number {
        return this._sendLevelToDelay;
    }

    public set sendLevelToDelay(value: number) {
        this._sendLevelToDelay = value;
        this.delayGain = value / GAIN_SCALE;
    }

    private _preLowpass = 0;

    public get preLowpass(): number {
        return this._preLowpass;
    }

    public set preLowpass(value: number) {
        this._preLowpass = value;
        this.input.setPreLowPass(value);
    }

    private _depth = 0;

    public get depth(): number {
        return this._depth;
    }

    public set depth(value: number) {
        this._depth = value;
        this.depthSamples =
            (Math.max(0, Math.min(value, 127)) + 1) * DEPTH_STEP * this.step;
    }

    private _delay = 0;

    public get delay(): number {
        return this._delay;
    }

    public set delay(value: number) {
        this._delay = value;
        this.delaySamples =
            Math.max(0, Math.min(value, 127)) * DELAY_STEP * this.step;
    }

    private _feedback = 0;

    public get feedback(): number {
        return this._feedback;
    }

    public set feedback(value: number) {
        this._feedback = value;
        this.feedbackGain = value / GAIN_SCALE;
    }

    private _rate = 0;

    public get rate() {
        return this._rate;
    }

    public set rate(value: number) {
        this._rate = value;
        this.lfo.setRate(value * RATE_HZ);
    }

    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        outputReverb: Float32Array,
        outputDelay: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        const {
            delayLine,
            lfo,
            gain,
            reverbGain,
            delayGain,
            feedbackGain,
            delaySamples,
            depthSamples
        } = this;
        let feedbackSample = this.feedbackSample;
        for (let i = 0; i < sampleCount; i++) {
            // The feedback does not pass through the input stage
            delayLine.write(
                this.input.process(input[i]) + feedbackSample * feedbackGain
            );

            // Triangle LFO, the second read is half a cycle away
            const triangle = Math.abs(lfo.process());
            const left = delayLine.readLinear(
                delaySamples + depthSamples * triangle
            );
            const right = delayLine.readLinear(
                delaySamples + depthSamples * (1 - triangle)
            );
            feedbackSample = left;

            const o = i + startIndex;
            outputLeft[o] += left * gain;
            outputRight[o] += right * gain;
            // The sends take both reads, before the level
            const mono = left + right;
            outputReverb[i] += mono * reverbGain;
            outputDelay[i] += mono * delayGain;
        }
        this.feedbackSample = feedbackSample;
    }

    public reset() {
        this.input.clear();
        this.lfo.clear();
        this.delayLine.clear();
        this.feedbackSample = 0;
        this.level = LEVEL_UNITY;
        this.preLowpass = 0;
        this.feedback = 0;
        this.delay = 0;
        this.rate = 0;
        this.depth = 0;
        this.sendLevelToReverb = 0;
        this.sendLevelToDelay = 0;
    }

    public getSnapshot(): GSChorusParameter {
        return {
            preLowpass: this._preLowpass,
            depth: this._depth,
            delay: this._delay,
            sendLevelToDelay: this._sendLevelToDelay,
            sendLevelToReverb: this._sendLevelToReverb,
            rate: this._rate,
            feedback: this._feedback,
            level: this._level
        };
    }

    public applySnapshot(snapshot: GSChorusParameter) {
        this.level = snapshot.level;
        this.preLowpass = snapshot.preLowpass;
        this.feedback = snapshot.feedback;
        this.delay = snapshot.delay;
        this.rate = snapshot.rate;
        this.depth = snapshot.depth;
        this.sendLevelToReverb = snapshot.sendLevelToReverb;
        this.sendLevelToDelay = snapshot.sendLevelToDelay;
    }
}
