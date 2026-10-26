import { XGChorus, type XGChorusPreset } from "./xg_chorus";

/**
 * FB CHORUS (`41 07`).
 */
export class XGFBChorus extends XGChorus {
    public readonly type = 0x41_07;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 504, 0, 0, 504, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [6, 43, 107, 111, 0, 28, 64, 46, 64, 64, 46, 64, 10, 0, 0, 0],
        variationGain: 63
    };
}
