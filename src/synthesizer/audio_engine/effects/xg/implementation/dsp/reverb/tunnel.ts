import { XGRoomReverb, type XGRoomReverbPreset } from "./xg_reverb";

/**
 * TUNNEL (`11 00`) in the reverb block.
 */
export class XGTunnel extends XGRoomReverb {
    public readonly type = 0x11_00;
    protected readonly preset: XGRoomReverbPreset = {
        words: [
            0, 512, 512, 512, 512, 0, 512, 512, 512, 512, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 18_427, 0,
            1256, 0, 2233, 0, 2914, 0, 3744, 0, 5472, 8480, 12_784, 0
        ],
        defaults: [48, 6, 19, 0, 44, 33, 52, 70, 16, 40, 20, 3, 64, 7, 64, 0],
        gain: 7,
        earlyLevel: 48,
        hpfGain: 0,
        roomSelect: 1,
        roomStep: 4,
        wall: "depth"
    };
}
