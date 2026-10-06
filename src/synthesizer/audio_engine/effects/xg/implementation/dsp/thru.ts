import type { DefaultXGEffectProcesor } from "./effect_processor";

/**
 * MU128 manual description:
 * Bypass without applying an effect.
 */
export class XGThru implements DefaultXGEffectProcesor {
    public readonly type = 0x40_00;

    public setParameter(param: number, value: number) {
        void param;
        void value;
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        isInsertion: boolean
    ) {
        void inputLeft;
        void inputRight;
        void isInsertion;
        void sampleCount;
        if (isInsertion) {
            // Thru is bypass, not disabled
            outputLeft.set(inputLeft);
            outputRight.set(inputRight);
        } else {
            outputLeft.fill(0, 0, sampleCount);
            outputRight.fill(0, 0, sampleCount);
        }
    }

    public reset() {
        // Noop
    }

    public getSnapshot() {
        return new Int16Array(16);
    }
}
