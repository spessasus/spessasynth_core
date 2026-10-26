import { XGChorus, type XGChorusPreset } from "./xg_chorus";

/**
 * CHORUS 1 (`41 00`).
 */
export class XGChorus1 extends XGChorus {
    public readonly type = 0x41_00;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 504, 0, 0, 504, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [6, 54, 77, 106, 0, 28, 64, 46, 64, 64, 46, 64, 10, 0, 0, 0],
        variationGain: 63
    };
}
