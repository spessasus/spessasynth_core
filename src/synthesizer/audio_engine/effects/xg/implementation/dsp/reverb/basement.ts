import { XGRoomReverb, type XGRoomReverbPreset } from "./xg_reverb";

/**
 * BASEMENT (`13 00`) in the reverb block.
 */
export class XGBasement extends XGRoomReverb {
    public readonly type = 0x13_00;
    protected readonly preset: XGRoomReverbPreset = {
        words: [
            0, 512, 512, 512, 512, 0, 512, 512, 512, 512, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18_427, 0,
            1256, 0, 2233, 0, 2914, 0, 3744, 0, 5472, 8480, 12_784, 0
        ],
        defaults: [3, 6, 3, 0, 34, 26, 29, 59, 15, 40, 32, 3, 64, 8, 64, 0],
        gain: 7,
        earlyLevel: 24,
        hpfGain: 0,
        roomSelect: 3,
        roomStep: 12,
        wall: "height"
    };
}
