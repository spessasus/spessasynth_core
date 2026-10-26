import { XGReverb, type XGReverbPreset } from "./xg_reverb";

/**
 * GM PLATE (`04 07`) in the reverb block.
 */
export class XGGMPlate extends XGReverb {
    public readonly type = 0x04_07;
    protected readonly preset: XGReverbPreset = {
        words: [
            0, 512, 512, 512, 512, 0, 512, 512, 512, 512, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18_427, 0,
            1256, 0, 2233, 0, 2914, 0, 3744, 0, 8315, 12_236, 15_532, 0
        ],
        defaults: [25, 10, 6, 8, 49, 0, 0, 0, 0, 40, 2, 3, 64, 5, 64, 0],
        gain: 3,
        earlyLevel: 61,
        hpfGain: -2
    };
}
