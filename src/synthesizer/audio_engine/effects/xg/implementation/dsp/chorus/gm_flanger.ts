import { type XGChorusPreset, XGFlanger } from "./xg_chorus";

/**
 * GM FLANGER (`43 07`).
 */
export class XGGMFlanger extends XGFlanger {
    public readonly type = 0x43_07;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 312, 0, 0, 312, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [3, 21, 120, 1, 0, 28, 64, 46, 64, 96, 40, 64, 10, 4, 0, 0],
        variationGain: 63
    };
}
