import { type XGChorusPreset, XGFlanger } from "./xg_chorus";

/**
 * FLANGER 1 (`43 00`).
 */
export class XGFlanger1 extends XGFlanger {
    public readonly type = 0x43_00;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 312, 0, 0, 312, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [14, 14, 104, 2, 0, 28, 64, 46, 64, 96, 40, 64, 10, 4, 1, 0],
        variationGain: 45
    };
}
