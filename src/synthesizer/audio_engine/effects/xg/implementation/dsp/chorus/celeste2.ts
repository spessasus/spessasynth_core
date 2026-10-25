import { XGCeleste, type XGChorusPreset } from "./xg_chorus";

/**
 * CELESTE 2 (`42 01`).
 */
export class XGCeleste2 extends XGCeleste {
    public readonly type = 0x42_01;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 683, 0, 341, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 336, 336, 0, 336, 336, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [28, 18, 90, 2, 0, 28, 62, 42, 60, 84, 40, 68, 10, 0, 0, 0],
        variationGain: 48
    };
}
