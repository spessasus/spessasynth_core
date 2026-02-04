import type { ReverbProcessor } from "../types";

const DELAY = 0.5;

export class SpessaSynthReverb implements ReverbProcessor {
    public character = 0;
    public time = 0;
    public delayFeedback = 0;
    public level = 0;
    public preDelayTime = 0;
    public preLowpass = 0;
    private readonly sampleRate;
    private readonly delayLine;
    private writeIndex = 0;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.delayLine = new Float32Array(DELAY * sampleRate);
        this.reset();
        console.log("init test reverb", this.sampleRate);
    }

    public setMacro(macro: number): void {
        console.log(`Set reverb macro to ${macro}`);
    }

    public reset(): void {
        this.character = 4;
        this.time = 64;
        this.delayFeedback = 0;
        this.level = 64;
        this.preDelayTime = 0;
        this.preLowpass = 0;
        console.log("Reverb reset call!");
    }

    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        endIndex: number
    ) {
        const buffer = this.delayLine;
        const bufferLength = buffer.length;
        let writeIndex = this.writeIndex;

        for (let i = startIndex; i < endIndex; i++) {
            // Read delayed sample
            const delayedSample = buffer[writeIndex];

            // Write current input into buffer
            buffer[writeIndex] = input[i - startIndex] + delayedSample;

            // Output mono → stereo
            outputLeft[i] += delayedSample;
            outputRight[i] += delayedSample;

            // Advance circular index
            writeIndex++;
            if (writeIndex >= bufferLength) {
                writeIndex = 0;
            }
        }

        this.writeIndex = writeIndex;
    }
}
