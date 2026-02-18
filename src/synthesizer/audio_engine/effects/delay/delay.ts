import type { DelayProcessor } from "../types";
import { DelayLine } from "../delay_line";
import { INITIAL_BUFFER_SIZE } from "../../engine_components/synth_constants";

// SC-8850 manual p.236
// How nice of Roland to provide the conversion values to ms!
const delayTimeSegments = [
    { start: 0x01, end: 0x14, timeStart: 0.1, resolution: 0.1 },
    { start: 0x14, end: 0x23, timeStart: 2, resolution: 0.2 },
    { start: 0x23, end: 0x2d, timeStart: 5, resolution: 0.5 },
    { start: 0x2d, end: 0x37, timeStart: 10, resolution: 1 },
    { start: 0x37, end: 0x46, timeStart: 20, resolution: 2 },
    { start: 0x46, end: 0x50, timeStart: 50, resolution: 5 },
    { start: 0x50, end: 0x5a, timeStart: 100, resolution: 10 },
    { start: 0x5a, end: 0x69, timeStart: 200, resolution: 20 },
    { start: 0x69, end: 0x73, timeStart: 500, resolution: 50 }
] as const;

export class SpessaSynthDelay implements DelayProcessor {
    /**
     * Cutoff frequency
     * @private
     */
    private preLPFfc = 8000;
    /**
     * Alpha
     * @private
     */
    private preLPFa = 0;
    /**
     * Previous value
     * @private
     */
    private preLPFz = 0;
    private readonly delayLeft;
    private readonly delayRight;
    private readonly delayCenter;
    private readonly sampleRate;
    private delayCenterOutput = new Float32Array(INITIAL_BUFFER_SIZE);
    private delayPreLPF = new Float32Array(INITIAL_BUFFER_SIZE);
    private delayCenterTime;
    private delayLeftMultiplier = 0.04;
    private delayRightMultiplier = 0.04;
    private gain = 0;
    private reverbGain = 0;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.delayCenterTime = 0.34 * sampleRate;
        // All delays are capped at 1s
        this.delayCenter = new DelayLine(sampleRate);
        this.delayLeft = new DelayLine(sampleRate);
        this.delayRight = new DelayLine(sampleRate);
    }

    private _sendLevelToReverb = 0;

    public get sendLevelToReverb(): number {
        return this._sendLevelToReverb;
    }

    public set sendLevelToReverb(value: number) {
        this._sendLevelToReverb = value;
        this.reverbGain = value / 127;
    }

    private _preLowpass = 0;

    public get preLowpass(): number {
        return this._preLowpass;
    }

    public set preLowpass(value: number) {
        this._preLowpass = value;
        // GS sure loves weird mappings, huh?
        // Maps to around 8000-300 Hz
        this.preLPFfc = 8000 * 0.63 ** this._preLowpass;
        const decay = Math.exp(
            (-2 * Math.PI * this.preLPFfc) / this.sampleRate
        );
        this.preLPFa = 1 - decay;
    }

    private _levelRight = 0;

    public get levelRight(): number {
        return this._levelRight;
    }

    public set levelRight(value: number) {
        this._levelRight = value;
        this.updateGain();
    }

    private _level = 64;

    public get level(): number {
        return this._level;
    }

    public set level(value: number) {
        this._level = value;
        this.gain = value / 127;
    }

    private _levelCenter = 127;

    public get levelCenter(): number {
        return this._levelCenter;
    }

    public set levelCenter(value: number) {
        this._levelCenter = value;
        this.updateGain();
    }

    private _levelLeft = 0;

    public get levelLeft(): number {
        return this._levelLeft;
    }

    public set levelLeft(value: number) {
        this._levelLeft = value;
        this.updateGain();
    }

    private _feedback = 16;

    public get feedback(): number {
        return this._feedback;
    }

    public set feedback(value: number) {
        this._feedback = value;
        // Only the center delay has feedback
        this.delayLeft.feedback = this.delayRight.feedback = 0;
        // -64 means max at inverted phase, so feedback of -1 it is!
        // Use 66 for it to not be infinite
        this.delayCenter.feedback = (value - 64) / 66;
    }

    private _timeRatioRight = 0;

    public get timeRatioRight(): number {
        return this._timeRatioRight;
    }

    public set timeRatioRight(value: number) {
        this._timeRatioRight = value;
        // DELAY TIME RATIO LEFT and DELAY TIME RATIO RIGHT specify the ratio in relation to DELAY TIME CENTER.
        // The resolution is 100/24(%).
        // Turn that into multiplier
        this.delayRightMultiplier = value * (100 / 2400);
        this.delayRight.time = this.delayCenterTime * this.delayRightMultiplier;
    }

    private _timeRatioLeft = 0;

    public get timeRatioLeft(): number {
        return this._timeRatioLeft;
    }

    public set timeRatioLeft(value: number) {
        this._timeRatioLeft = value;
        // DELAY TIME RATIO LEFT and DELAY TIME RATIO RIGHT specify the ratio in relation to DELAY TIME CENTER.
        // The resolution is 100/24(%).
        // Turn that into multiplier
        this.delayLeftMultiplier = value * (100 / 2400);
        this.delayLeft.time = this.delayCenterTime * this.delayLeftMultiplier;
    }

    private _timeCenter = 12;

    public get timeCenter(): number {
        return this._timeCenter;
    }

    public set timeCenter(value: number) {
        this._timeCenter = value;

        let delayMs = 0.1;
        for (const segment of delayTimeSegments) {
            if (value >= segment.start && value < segment.end) {
                delayMs =
                    segment.timeStart +
                    (value - segment.start) * segment.resolution;
                break;
            }
        }
        this.delayCenterTime = Math.max(2, this.sampleRate * (delayMs / 1000));
        this.delayCenter.time = this.delayCenterTime;
        this.delayLeft.time = this.delayCenterTime * this.delayLeftMultiplier;
        this.delayRight.time = this.delayCenterTime * this.delayRightMultiplier;
    }

    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        outputReverb: Float32Array,
        startIndex: number,
        sampleCount: number
    ): void {
        // Grow buffer if needed
        if (this.delayCenterOutput.length < sampleCount) {
            this.delayCenterOutput = new Float32Array(sampleCount);
            this.delayPreLPF = new Float32Array(sampleCount);
        }

        // Process pre-lowpass
        let delayIn: Float32Array;
        if (this._preLowpass > 0) {
            const preLPF = this.delayPreLPF;
            let z = this.preLPFz;
            const a = this.preLPFa;
            for (let i = 0; i < sampleCount; i++) {
                const x = input[i];
                z += a * (x - z);
                preLPF[i] = z;
            }
            this.preLPFz = z;
            delayIn = preLPF;
        } else {
            delayIn = input;
        }

        /*
        Connections are:
        Input connects to all delays,
        center connects to both output and stereo delays,
        stereo delays only connect to the output.
        Also level is separate from reverb send level,
        i.e. level = 0 and reverb send level = 127 will still send sound to reverb.
         */
        const { gain, reverbGain } = this;

        // Process center first
        this.delayCenter.process(delayIn, this.delayCenterOutput, sampleCount);

        // Mix into output
        const center = this.delayCenterOutput;
        for (let i = 0, o = startIndex; i < sampleCount; i++, o++) {
            const sample = center[i];
            outputReverb[i] += sample * reverbGain;
            const outSample = sample * gain;
            outputLeft[o] += outSample;
            outputRight[o] += outSample;
        }

        // Add input into delay (stereo delays take input from both)
        for (let i = 0; i < sampleCount; i++) {
            center[i] += input[i];
        }

        // Process stereo delays (reuse preLPF array as delays overwrite samples)
        const stereoOut = this.delayPreLPF;
        // Left
        this.delayLeft.process(center, stereoOut, sampleCount);
        for (let i = 0, o = startIndex; i < sampleCount; i++, o++) {
            const sample = stereoOut[i];
            outputLeft[o] += sample * gain;
            outputReverb[i] += sample * reverbGain;
        }
        // Right
        this.delayRight.process(center, stereoOut, sampleCount);
        for (let i = 0, o = startIndex; i < sampleCount; i++, o++) {
            const sample = stereoOut[i];
            outputRight[o] += sample * gain;
            outputReverb[i] += sample * reverbGain;
        }
    }

    private updateGain() {
        this.delayCenter.gain = this._levelCenter / 127;
        this.delayLeft.gain = this._levelLeft / 127;
        this.delayRight.gain = this._levelRight / 127;
    }
}
