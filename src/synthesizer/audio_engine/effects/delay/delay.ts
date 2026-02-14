import type { DelayProcessor } from "../types";
import { DelayLine } from "../delay_line";

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
    public feedback = 16;
    public level = 64;
    public levelCenter = 127;
    public levelLeft = 0;
    public levelRight = 0;
    public preLowpass = 0;
    private readonly delayLeft;
    private readonly delayRight;
    private readonly delayCenter;
    private readonly sampleRate;
    private delayCenterOutput;
    private delayCenterTime;
    private delayLeftMultiplier = 0.04;
    private delayRightMultiplier = 0.04;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.delayCenterTime = 0.34 * sampleRate;
        // All delays are capped at 1s
        this.delayCenter = new DelayLine(sampleRate);
        this.delayLeft = new DelayLine(sampleRate);
        this.delayRight = new DelayLine(sampleRate);
        this.delayCenterOutput = new Float32Array(128);
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

        let delayMs = 0;
        for (const segment of delayTimeSegments) {
            if (value >= segment.start && value <= segment.end) {
                delayMs =
                    segment.timeStart +
                    (value - segment.start) * segment.resolution;
                break;
            }
        }
        this.delayCenterTime = this.sampleRate * (delayMs / 1000);
        this.delayCenter.time = this.delayCenterTime;
        this.delayLeft.time = this.delayCenterTime * this.delayLeftMultiplier;
        this.delayRight.time = this.delayCenterTime * this.delayRightMultiplier;
    }

    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        endIndex: number
    ): void {
        // Grow buffer if needed
        const samples = endIndex - startIndex;
        if (this.delayCenterOutput.length < samples) {
            this.delayCenterOutput = new Float32Array(samples);
        }

        // Process center first
        this.delayCenter.process(input, this.delayCenterOutput, samples);
        // FIXME: temporary, implement the delay!
        void this.delayRight;
        void this.delayLeft;

        void input;
        void outputLeft;
        void outputRight;
        void startIndex;
        void endIndex;
    }
}
