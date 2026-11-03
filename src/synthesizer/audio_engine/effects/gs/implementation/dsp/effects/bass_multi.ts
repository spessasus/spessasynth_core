import type { DelayMemory } from "../blocks/delay_memory";
import { BASS_DISTORTION, BASS_OVERDRIVE } from "../blocks/drive";
import { BassAmpSimulator } from "../blocks/bass_amp_simulator";
import { GSDriveEQMulti } from "./guitar_multis";

/**
 * Bass Multi (`04 05`): `L+R -> compressor -> bass overdrive/distortion -> bass amp simulator -> 3-band EQ ->
 * chorus/flanger`.
 * Parameters: 1-4 compressor sustain, attack, level and switch, 5 drive type (OD, DS), 6 drive, 7 amp type (0-2),
 * 8 amp switch, 9 drive switch, 10 low gain, 11-13 mid frequency, Q and gain, 14 high gain, 15 chorus or flanger,
 * 16 rate (Rate2 column), 17 depth, 18 flanger feedback, 19 chorus level, 20 level. EFX control source 1 moves the
 * drive, source 2 the chorus level.
 * @internal
 */
export class GSBassMulti extends GSDriveEQMulti {
    public readonly type = 0x04_05;
    protected readonly defaults = new Uint8Array([
        0x48, 0x64, 0x4b, 0x01, 0x00, 0x30, 0x00, 0x00, 0x01, 0x42, 0x48, 0x01,
        0x44, 0x40, 0x00, 0x05, 0x14, 0x66, 0x40, 0x4c
    ]);
    protected readonly limits = { 3: 1, 4: 1, 6: 2, 7: 1, 8: 1, 11: 4, 14: 1 };

    public constructor(sampleRate: number, memory: DelayMemory) {
        // The chain goes into the chorus/flanger at full level, and its compressor looks 50 samples ahead, not 32
        super(
            sampleRate,
            memory,
            {
                overdrive: BASS_OVERDRIVE,
                distortion: BASS_DISTORTION,
                amp: new BassAmpSimulator(sampleRate)
            },
            1,
            50 / 32_000
        );
        // The chorus/flanger takes nothing below 200 Hz (the hardware's one-pole, pole 123/128)
        this.modulation.setHighPass(202.88, 252 / 251);
        this.reset();
    }
}
