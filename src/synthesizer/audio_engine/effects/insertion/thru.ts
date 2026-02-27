import type { InsertionProcessor } from "../types";

export class ThruFX implements InsertionProcessor {
    public sendLevelToReverb = 40 / 127;
    public sendLevelToChorus = 0;
    public sendLevelToDelay = 0;
    public readonly type = 0x00_00;

    public reset() {
        /* Empty */
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        outputReverb: Float32Array,
        outputChorus: Float32Array,
        outputDelay: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        const { sendLevelToReverb, sendLevelToChorus, sendLevelToDelay } = this;
        for (let i = 0; i < sampleCount; i++) {
            const sL = inputLeft[i];
            const sR = inputRight[i];
            const idx = startIndex + i;
            outputLeft[idx] += sL;
            outputRight[idx] += sR;
            const mono = (sL + sR) * 0.5;
            outputReverb[i] += mono * sendLevelToReverb;
            outputChorus[i] += mono * sendLevelToChorus;
            outputDelay[i] += mono * sendLevelToDelay;
        }
    }

    public setParameter(parameter: number, value: number) {
        void parameter;
        void value;
    }
}
