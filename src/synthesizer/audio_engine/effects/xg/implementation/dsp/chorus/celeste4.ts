import { XGCeleste, type XGChorusPreset } from "./xg_chorus";

/**
 * CELESTE 4 (`42 08`).
 */
export class XGCeleste4 extends XGCeleste {
    public readonly type = 0x42_08;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 683, 0, 341, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 336, 336, 0, 336, 336, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [8, 29, 64, 0, 0, 28, 64, 51, 66, 127, 40, 68, 10, 0, 1, 0],
        variationGain: 48
    };
}
