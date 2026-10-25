import { XGCeleste, type XGChorusPreset } from "./xg_chorus";

/**
 * CELESTE 3 (`42 02`).
 */
export class XGCeleste3 extends XGCeleste {
    public readonly type = 0x42_02;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 683, 0, 341, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 336, 336, 0, 336, 336, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [4, 63, 44, 2, 0, 28, 64, 46, 68, 127, 40, 68, 10, 0, 0, 0],
        variationGain: 48
    };
}
