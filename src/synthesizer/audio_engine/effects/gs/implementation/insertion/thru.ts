import type { DefaultGSInsertionProcessor } from "./insertion_processor";

export class ThruFX implements DefaultGSInsertionProcessor {
    public readonly type = 0x00_00;

    public reset() {
        /* Empty */
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        for (let i = 0; i < sampleCount; i++) {
            outputLeft[i] = inputLeft[i];
            outputRight[i] = inputRight[i];
        }
    }

    public setParameter(parameter: number, value: number) {
        void parameter;
        void value;
    }
}
