import type { DelayMemory } from "../blocks/delay_memory";
import { GSEffect } from "../gs_effect";
import { levelGain, MONO_INPUT, STAGE_OUTPUT } from "../glue";
import { MonoMix } from "../blocks/mono_mix";
import { Drive, ROTARY_MULTI_DRIVE } from "../blocks/drive";
import { Rotary } from "../blocks/rotary";
import { rate1, slewTime } from "../conversion";
import { MultiEQ } from "./guitar_multi";

/**
 * The gain into the rotary: the EQ's output byte (127/128), and twice the level the Rotary block expects (it halves
 * its input, Rotary Multi's program does not).
 */
const ROTARY_GAIN = (2 * 127) / 128;

/**
 * Rotary Multi (`03 00`): `L+R -> drive (switchable) -> 3-band EQ -> rotary`. The drive is the Humanizer's at half
 * the level, and the rotary takes the chain at full level (the Rotary halves its input).
 * Parameters: 1 drive, 2 drive switch, 3 low gain, 4 mid frequency (EQ column), 5 mid Q, 6 mid gain, 7 high gain,
 * 8 low slow, 9 low fast, 10 low accel, 11 low level, 12 high slow, 13 high fast, 14 high accel, 15 high level
 * (rates on the Rate1 column), 16 separation, 17 speed (slow, fast from 64), 20 level. EFX control source 1 moves
 * the drive, source 2 the speed.
 * @internal
 */
export class GSRotaryMulti extends GSEffect {
    public readonly type = 0x03_00;
    protected readonly defaults = new Uint8Array([
        0x0d, 0x01, 0x40, 0x48, 0x00, 0x40, 0x40, 0x06, 0x71, 0x18, 0x7f, 0x11,
        0x78, 0x58, 0x40, 0x60, 0x00, 0x00, 0x00, 0x60
    ]);
    protected readonly limits = { 1: 1, 4: 4 };
    private readonly mix: MonoMix;
    private readonly drive: Drive;
    private readonly eq: MultiEQ;
    private readonly rotary: Rotary;
    private driveOn = false;
    private gain = 0;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.mix = new MonoMix(sampleRate);
        this.drive = new Drive(sampleRate);
        this.drive.setPreset(ROTARY_MULTI_DRIVE);
        this.eq = new MultiEQ(sampleRate);
        this.rotary = new Rotary(sampleRate, memory);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { rotary, gain } = this;
        for (let i = 0; i < sampleCount; i++) {
            const x =
                this.mix.process(inputLeft[i], inputRight[i]) * MONO_INPUT;
            // Both paths run, so the switch does not click
            const driven = this.drive.process(x);
            rotary.process(
                ROTARY_GAIN *
                    this.eq.process(this.driveOn ? driven : this.drive.input)
            );
            outputLeft[i] = rotary.left * gain;
            outputRight[i] = rotary.right * gain;
        }
    }

    public reset() {
        super.reset();
        this.rotary.settle();
    }

    protected clear() {
        this.mix.clear();
        this.drive.clear();
        this.eq.clear();
        this.rotary.clear();
    }

    protected update() {
        const p = this.parameters;
        this.drive.setDrive(this.controlled(0, 0));
        this.driveOn = p[1] === 1;
        this.eq.setShelves(p[2], p[6]);
        this.eq.setMid(p[3], p[4], p[5]);
        const fast = this.controlled(1, 16) >= 64;
        this.rotary.setRates(rate1(p[fast ? 12 : 11]), rate1(p[fast ? 8 : 7]));
        this.rotary.setAcceleration(slewTime(p[13]), slewTime(p[9]));
        this.rotary.setLevels(levelGain(p[14]), levelGain(p[10]));
        this.rotary.setSeparation(levelGain(p[15]));
        this.gain = levelGain(p[19]) * STAGE_OUTPUT;
    }
}
