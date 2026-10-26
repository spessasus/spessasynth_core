import { XGChorus, type XGChorusPreset } from "./xg_chorus";

/**
 * CHORUS 2 (`41 01`).
 */
export class XGChorus2 extends XGChorus {
    public readonly type = 0x41_01;
    protected readonly preset: XGChorusPreset = {
        words: [
            0, 512, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 504, 0, 0, 504, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1
        ],
        defaults: [8, 63, 64, 30, 0, 28, 62, 42, 58, 64, 46, 64, 10, 0, 0, 0],
        variationGain: 63
    };
}
