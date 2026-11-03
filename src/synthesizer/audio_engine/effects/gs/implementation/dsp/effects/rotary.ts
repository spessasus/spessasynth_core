import type { DelayMemory } from "../blocks/delay_memory";
import { GSEffect } from "../gs_effect";
import { levelGain, MONO_INPUT, shelfGain, STAGE_OUTPUT } from "../glue";
import { MonoMix } from "../blocks/mono_mix";
import { Rotary } from "../blocks/rotary";
import { ShelfCorners, ShelfEQ } from "../blocks/shelf_eq";
import { rate1, slewTime } from "../conversion";

/**
 * Rotary (`01 22`): `L+R -> rotary -> EQ` per side.
 * Parameters: 1 low slow, 2 low fast, 3 low accel, 4 low level, 5 high slow, 6 high fast, 7 high accel, 8 high level
 * (rates on the Rate1 column), 9 separation, 11 speed (slow, fast from 64), 17 low gain, 18 high gain, 20 level.
 * EFX control source 1 moves the speed, source 2 the level.
 * @internal
 */
export class GSRotary extends GSEffect {
    public readonly type = 0x01_22;
    protected readonly defaults = new Uint8Array([
        0x06, 0x71, 0x18, 0x7f, 0x11, 0x78, 0x58, 0x40, 0x60, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x7f
    ]);
    private readonly mix: MonoMix;
    private readonly rotary: Rotary;
    private readonly shelvesL: ShelfEQ;
    private readonly shelvesR: ShelfEQ;
    private gain = 0;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.mix = new MonoMix(sampleRate);
        this.rotary = new Rotary(sampleRate, memory);
        this.shelvesL = new ShelfEQ(sampleRate);
        this.shelvesR = new ShelfEQ(sampleRate);
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
            rotary.process(
                this.mix.process(inputLeft[i], inputRight[i]) * MONO_INPUT
            );
            outputLeft[i] = this.shelvesL.process(rotary.left) * gain;
            outputRight[i] = this.shelvesR.process(rotary.right) * gain;
        }
    }

    public reset() {
        super.reset();
        this.rotary.settle();
    }

    protected clear() {
        this.mix.clear();
        this.rotary.clear();
        this.shelvesL.clear();
        this.shelvesR.clear();
    }

    protected update() {
        const p = this.parameters;
        const fast = this.controlled(0, 10) >= 64;
        this.rotary.setRates(rate1(p[fast ? 5 : 4]), rate1(p[fast ? 1 : 0]));
        this.rotary.setAcceleration(slewTime(p[6]), slewTime(p[2]));
        this.rotary.setLevels(levelGain(p[7]), levelGain(p[3]));
        this.rotary.setSeparation(levelGain(p[8]));
        this.shelvesL.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelvesL.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        this.shelvesR.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelvesR.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        this.gain = levelGain(this.controlled(1, 19)) * STAGE_OUTPUT;
    }
}
