import { XGChorus, type XGChorusPreset } from "./xg_chorus";

/**
 * GM CHORUS 2 (`41 04`).
 */
export class XGGMChorus2 extends XGChorus {
    public readonly type = 0x41_04;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 504, 0, 0, 504, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [26, 34, 67, 105, 0, 28, 64, 46, 64, 64, 46, 64, 10, 0, 0, 0],
        variationGain: 63
    };
}
