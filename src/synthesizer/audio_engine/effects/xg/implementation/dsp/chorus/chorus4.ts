import { XGChorus, type XGChorusPreset } from "./xg_chorus";

/**
 * CHORUS 4 (`41 08`).
 */
export class XGChorus4 extends XGChorus {
    public readonly type = 0x41_08;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 504, 504, 0, 504, 504, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [9, 32, 69, 104, 0, 28, 64, 46, 64, 64, 46, 64, 10, 0, 1, 0],
        variationGain: 63
    };
}
