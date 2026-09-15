import type { DelayProcessor, DelayProcessorSnapshot } from "../types";

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
    { start: 0x69, end: 0x74, timeStart: 500, resolution: 50 }
] as const;

const DELAY_GAIN = 1.66;

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
    private readonly buffer;
    private readonly sampleRate;
    private readonly delayPreLPF;
    private delayLeftMultiplier = 0.04;
    private delayRightMultiplier = 0.04;
    private gain = 0;
    private reverbGain = 0;
    private feedbackGain = 0;
    /**
     * Samples
     */
    private delayCenter;
    /**
     * Samples
     */
    private delayLeft;
    /**
     * Samples
     */
    private delayRight;
    private gainCenter = 1;
    private gainLeft = 0;
    private gainRight = 0;
    private writeIndex = 0;

    public constructor(sampleRate: number, maxBufferSize: number) {
        this.sampleRate = sampleRate;
        this.buffer = new Float32Array(sampleRate);
        this.delayPreLPF = new Float32Array(maxBufferSize);
        this.delayCenter = Math.floor(0.34 * sampleRate);
        this.delayLeft = Math.floor(this.delayCenter * 0.04);
        this.delayRight = Math.floor(this.delayCenter * 0.04);
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
        this.gain = (value / 127) * DELAY_GAIN;
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
        // -64 means max at inverted phase
        // Use 66 for it to not be infinite (-1)
        this.feedbackGain = (value - 64) / 66;
        this._feedback = value;
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
        this.delayCenter = Math.floor(
            Math.max(2, this.sampleRate * (delayMs / 1000))
        );
        this.delayLeft = Math.floor(
            this.delayCenter * this.delayLeftMultiplier
        );
        this.delayRight = Math.floor(
            this.delayCenter * this.delayRightMultiplier
        );
        this.buffer.fill(0);
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
    ): void {
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

        Center always sends to stereo, regardless of level center in hardware and latest SCVA, older revisions incorrectly don't send it,
        So level center = 0, level left = 127 will still have feedback.
        Also feedback time is always time center, even if only left delay is playing.
         */
        const {
            gain,
            reverbGain,
            delayCenter,
            delayLeft,
            delayRight,
            buffer,
            feedbackGain
        } = this;
        let writeIndex = this.writeIndex;
        const bufferLength = buffer.length;
        const centerGain = this.gainCenter * gain;
        const leftGain = this.gainLeft * gain;
        const rightGain = this.gainRight * gain;

        for (let i = 0; i < sampleCount; i++) {
            // Read center
            let centerReadIndex = writeIndex - delayCenter;
            if (centerReadIndex < 0) centerReadIndex += bufferLength;

            // Read left
            let leftReadIndex = (writeIndex - delayLeft) % bufferLength;
            if (leftReadIndex < 0) leftReadIndex += bufferLength;

            // Read right
            let rightReadIndex = (writeIndex - delayRight) % bufferLength;
            if (rightReadIndex < 0) rightReadIndex += bufferLength;

            // Write center
            const o = startIndex + i;
            const delayed = buffer[centerReadIndex];
            const c = delayed * centerGain;
            outputLeft[o] += c;
            outputRight[o] += c;
            outputReverb[o] += c * reverbGain;

            // Center feedback, do it first so left and right delay of 0 work fine
            // Testcase: gs_effect_send_level_test
            buffer[writeIndex] = delayIn[i] + delayed * feedbackGain;

            // Write left
            const l = buffer[leftReadIndex] * leftGain;
            outputLeft[o] += l;
            outputReverb[o] += l * reverbGain;

            // Write right
            const r = buffer[rightReadIndex] * rightGain;
            outputRight[o] += r;
            outputReverb[o] += r * reverbGain;

            // Advance and wrap
            if (++writeIndex >= bufferLength) writeIndex = 0;
        }
        this.writeIndex = writeIndex;
    }

    public getSnapshot(): DelayProcessorSnapshot {
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

    private updateGain() {
        // Center gain is applied in post
        this.gainCenter = this._levelCenter / 127;
        this.gainLeft = this._levelLeft / 127;
        this.gainRight = this._levelRight / 127;
    }
}
