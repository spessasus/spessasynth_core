import type { XGEffectProcessor } from "../framework/xg_effect_processor";

/**
 * MU128 manual description:
 * Turn off the effect.
 */
export class XGNoEffect implements XGEffectProcessor {
    public readonly type = 0x00_00;

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
        // Silence, honoring the OVERWRITE behavior.
        outputLeft.fill(0, 0, sampleCount);
        outputRight.fill(0, 0, sampleCount);
    }

    public reset() {
        // Noop
    }

    public getSnapshot(): Int16Array {
        return new Int16Array(16);
    }
}
