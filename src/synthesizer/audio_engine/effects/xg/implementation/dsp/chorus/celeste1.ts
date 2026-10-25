import { XGCeleste, type XGChorusPreset } from "./xg_chorus";

/**
 * CELESTE 1 (`42 00`).
 */
export class XGCeleste1 extends XGCeleste {
    public readonly type = 0x42_00;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 683, 0, 341, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 336, 336, 0, 336, 336, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [12, 32, 64, 0, 0, 28, 64, 46, 64, 127, 40, 68, 10, 0, 0, 0],
        variationGain: 48
    };
}
