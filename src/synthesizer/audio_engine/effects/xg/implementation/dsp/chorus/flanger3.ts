import { type XGChorusPreset, XGFlanger } from "./xg_chorus";

/**
 * FLANGER 3 (`43 08`).
 */
export class XGFlanger3 extends XGFlanger {
    public readonly type = 0x43_08;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 312, 0, 0, 312, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [4, 109, 109, 2, 0, 28, 64, 46, 64, 127, 40, 64, 10, 4, 1, 0],
        variationGain: 45
    };
}
