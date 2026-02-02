import type { ChorusProcessor } from "../types";

export class SpessaSynthChorus implements ChorusProcessor {
    public delay = 80;
    public depth = 19;
    public feedback = 8;
    public level = 64;
    public preLowpass = 0;
    public rate = 3;
    public inputBuffer = new Float32Array(128);
    private readonly sampleRate;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        console.log("test chorus init with", this.sampleRate);
    }
    public setMacro(macro: number): void {
        console.log(`Set chorus macro to ${macro}`);
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

    public reset(): void {
        console.log("Chorus reset call!");
    }
}
