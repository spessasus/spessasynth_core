import type { ReverbProcessor } from "../types";

export class SpessaSynthReverb implements ReverbProcessor {
    public character = 4;
    public time = 64;
    public delayFeedback = 0;
    public level = 64;
    public preDelayTime = 0;
    public preLowpass = 0;
    public inputBuffer = new Float32Array(128);
    private readonly sampleRate;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        console.log("init test reverb", this.sampleRate);
    }

    public setMacro(macro: number): void {
        console.log(`Set reverb macro to ${macro}`);
    }

    public reset(): void {
        console.log("Reverb reset call!");
    }

    public process(
        sampleCount: number,
        outputLeft: Float32Array,
        outputRight: Float32Array
    ) {
        const input = this.inputBuffer;
        for (let i = 0; i < sampleCount; i++) {
            outputLeft[i] += input[i];
            outputRight[i] += input[i];
        }
    }
}
