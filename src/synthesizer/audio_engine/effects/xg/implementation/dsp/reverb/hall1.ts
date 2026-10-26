import { XGReverb, type XGReverbPreset } from "./xg_reverb";

/**
 * HALL 1 (`01 00`) in the reverb block.
 */
export class XGHall1 extends XGReverb {
    public readonly type = 0x01_00;
    protected readonly preset: XGReverbPreset = {
        words: [
            0, 512, 512, 512, 512, 0, 512, 512, 512, 512, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18_427, 0,
            1256, 0, 2233, 0, 2914, 0, 3744, 0, 8315, 12_236, 15_532, 0
        ],
        defaults: [18, 10, 8, 13, 49, 0, 0, 0, 0, 40, 0, 3, 50, 8, 64, 0],
        gain: 0,
        earlyLevel: 76,
        hpfGain: 2
    };
}
