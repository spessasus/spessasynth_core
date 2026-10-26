import { XGChorus, type XGChorusPreset } from "./xg_chorus";

/**
 * GM CHORUS 3 (`41 05`).
 */
export class XGGMChorus3 extends XGChorus {
    public readonly type = 0x41_05;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 504, 0, 0, 504, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [9, 34, 69, 105, 0, 28, 64, 46, 66, 64, 46, 64, 10, 0, 0, 0],
        variationGain: 63
    };
}
