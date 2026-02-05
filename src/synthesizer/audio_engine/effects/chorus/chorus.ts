import type { ChorusProcessor } from "../types";

export class SpessaSynthChorus implements ChorusProcessor {
    public delay = 0;
    public depth = 0;
    public feedback = 0;
    public level = 0;
    public preLowpass = 0;
    public rate = 0;

    public constructor(sampleRate: number) {
        void sampleRate;
    }

    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        endIndex: number
    ) {
        void outputLeft;
        void outputRight;
        void input;
        void startIndex;
        void endIndex;
    }
}
