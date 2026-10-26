import { XGRoomReverb, type XGRoomReverbPreset } from "./xg_reverb";

/**
 * WHITE ROOM (`10 00`) in the reverb block.
 */
export class XGWhiteRoom extends XGRoomReverb {
    public readonly type = 0x10_00;
    protected readonly preset: XGRoomReverbPreset = {
        words: [
            0, 512, 512, 512, 512, 0, 512, 512, 512, 512, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18_427, 0,
            1256, 0, 2233, 0, 2914, 0, 3744, 0, 5472, 8480, 12_784, 0
        ],
        defaults: [9, 5, 11, 0, 46, 30, 50, 70, 7, 40, 34, 3, 64, 7, 64, 0],
        gain: 7,
        earlyLevel: 48,
        hpfGain: 0,
        roomSelect: 0,
        roomStep: 0,
        wall: "height"
    };
}
