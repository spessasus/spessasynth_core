import { XGReverb, type XGReverbPreset } from "./xg_reverb";

/**
 * ROOM 2 (`02 01`) in the reverb block.
 */
export class XGRoom2 extends XGReverb {
    public readonly type = 0x02_01;
    protected readonly preset: XGReverbPreset = {
        words: [
            0, 512, 512, 512, 512, 0, 512, 512, 512, 512, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18_427, 0,
            1256, 0, 2233, 0, 2914, 0, 3744, 0, 8315, 12_236, 15_532, 0
        ],
        defaults: [12, 10, 5, 4, 38, 0, 0, 0, 0, 40, 0, 3, 50, 8, 64, 0],
        gain: 1,
        earlyLevel: 69,
        hpfGain: 0
    };
}
