import { XGReverb, type XGReverbPreset } from "./xg_reverb";

/**
 * HALL 2 (`01 01`) in the reverb block.
 */
export class XGHall2 extends XGReverb {
    public readonly type = 0x01_01;
    protected readonly preset: XGReverbPreset = {
        words: [
            0, 512, 512, 512, 512, 0, 512, 512, 512, 512, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18_427, 0,
            1256, 0, 2233, 0, 2914, 0, 3744, 0, 8315, 12_236, 15_532, 0
        ],
        defaults: [25, 10, 28, 6, 46, 0, 0, 0, 0, 40, 13, 3, 74, 7, 64, 0],
        gain: 0,
        earlyLevel: 76,
        hpfGain: -1
    };
}
