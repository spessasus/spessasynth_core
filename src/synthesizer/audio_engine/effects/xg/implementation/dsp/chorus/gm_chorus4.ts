import { XGChorus, type XGChorusPreset } from "./xg_chorus";

/**
 * GM CHORUS 4 (`41 06`).
 */
export class XGGMChorus4 extends XGChorus {
    public readonly type = 0x41_06;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 504, 0, 0, 504, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [26, 29, 75, 102, 0, 28, 64, 46, 64, 64, 46, 64, 10, 0, 0, 0],
        variationGain: 63
    };
}
