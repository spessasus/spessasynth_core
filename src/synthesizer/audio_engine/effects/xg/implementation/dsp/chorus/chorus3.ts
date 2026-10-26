import { XGChorus, type XGChorusPreset } from "./xg_chorus";

/**
 * CHORUS 3 (`41 02`).
 */
export class XGChorus3 extends XGChorus {
    public readonly type = 0x41_02;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 504, 0, 0, 504, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [4, 44, 64, 110, 0, 28, 64, 46, 66, 64, 46, 64, 10, 0, 0, 0],
        variationGain: 63
    };
}
