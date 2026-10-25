import { XGReverb, type XGReverbPreset } from "./xg_reverb";

/**
 * STAGE 1 (`03 00`) in the reverb block.
 */
export class XGStage1 extends XGReverb {
    public readonly type = 0x03_00;
    protected readonly preset: XGReverbPreset = {
        words: [
            0, 512, 512, 512, 512, 0, 512, 512, 512, 512, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18_427, 0,
            1467, 0, 2725, 0, 3983, 0, 5303, 0, 8912, 12_305, 15_527, 0
        ],
        defaults: [19, 10, 16, 7, 54, 0, 0, 0, 0, 40, 0, 3, 64, 6, 64, 0],
        gain: 2,
        earlyLevel: 49,
        hpfGain: -1
    };
}
