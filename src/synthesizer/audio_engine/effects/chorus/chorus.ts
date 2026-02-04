import type { ChorusProcessor } from "../types";

export class SpessaSynthChorus implements ChorusProcessor {
    public delay = 0;
    public depth = 0;
    public feedback = 0;
    public level = 0;
    public preLowpass = 0;
    public rate = 0;
    private readonly sampleRate;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.reset();
        console.log("init test chorus", this.sampleRate);
    }
    public setMacro(macro: number): void {
        console.log(`Set chorus macro to ${macro}`);
    }

    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        endIndex: number
    ) {
        for (let i = startIndex; i < endIndex; i++) {
            outputLeft[i] += input[i - startIndex];
            outputRight[i] += input[i - startIndex];
        }
    }

    public reset(): void {
        this.delay = 80;
        this.depth = 19;
        this.feedback = 8;
        this.level = 64;
        this.preLowpass = 0;
        this.rate = 3;
        console.log("Chorus reset call!");
    }
}
