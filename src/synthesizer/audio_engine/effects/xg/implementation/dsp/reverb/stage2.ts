import { XGReverb, type XGReverbPreset } from "./xg_reverb";

/**
 * STAGE 2 (`03 01`) in the reverb block.
 */
export class XGStage2 extends XGReverb {
    public readonly type = 0x03_01;
    protected readonly preset: XGReverbPreset = {
        words: [
            0, 512, 512, 512, 512, 0, 512, 512, 512, 512, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18_427, 0,
            1467, 0, 2725, 0, 3983, 0, 5303, 0, 8912, 12_305, 15_527, 0
        ],
        defaults: [11, 10, 16, 7, 51, 0, 0, 0, 0, 40, 2, 2, 64, 6, 64, 0],
        gain: 2,
        earlyLevel: 49,
        hpfGain: -2
    };
}
