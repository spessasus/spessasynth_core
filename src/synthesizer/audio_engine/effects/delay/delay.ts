import type { DelayProcessor } from "../types";
import { DelayLine } from "../delay_line";

export class SpessaSynthDelay implements DelayProcessor {
    public feedback = 16;
    public level = 64;
    public levelCenter = 127;
    public levelLeft = 0;
    public levelRight = 0;
    public preLowpass = 0;
    public timeCenter = 12;
    public timeRatioLeft = 0;
    public timeRatioRight = 0;

    private readonly delayLeft;
    private readonly delayRight;
    private readonly delayCenter;
    private delayCenterOutput;

    public constructor(sampleRate: number) {
        this.delayCenter = new DelayLine(sampleRate);
        this.delayLeft = new DelayLine(sampleRate);
        this.delayRight = new DelayLine(sampleRate);
        this.delayCenterOutput = new Float32Array(128);
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
