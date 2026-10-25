import { type XGChorusPreset, XGFlanger } from "./xg_chorus";

/**
 * FLANGER 2 (`43 01`).
 */
export class XGFlanger2 extends XGFlanger {
    public readonly type = 0x43_01;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 312, 0, 0, 312, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [32, 17, 26, 2, 0, 28, 64, 46, 60, 96, 40, 64, 10, 4, 1, 0],
        variationGain: 45
    };
}
