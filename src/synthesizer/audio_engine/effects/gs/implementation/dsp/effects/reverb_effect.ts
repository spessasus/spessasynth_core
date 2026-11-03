import type { DelayMemory } from "../blocks/delay_memory";
import { GSEffect } from "../gs_effect";
import { balanceDry, balanceWet, shelfGain } from "../glue";
import { MonoMix } from "../blocks/mono_mix";
import { ShelfCorners, ShelfEQ } from "../blocks/shelf_eq";

/**
 * Reverb and Gate Reverb: `L+R -> reverb`, then per side the balance and the EQ.
 * The level goes in with the balance, in front of the EQ (not `StereoOutput`, which applies it after).
 * Each type keeps its own `process`, so the reverb's call in the sample loop only ever sees one class.
 * @internal
 */
export abstract class GSReverbEffect extends GSEffect {
    protected abstract readonly reverb: { clear(): void };
    protected readonly mix: MonoMix;
    protected readonly shelvesL: ShelfEQ;
    protected readonly shelvesR: ShelfEQ;
    /**
     * The balance gains with the level in them.
     */
    protected dry = 0;
    protected wet = 0;

    protected constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.mix = new MonoMix(sampleRate);
        this.shelvesL = new ShelfEQ(sampleRate);
        this.shelvesR = new ShelfEQ(sampleRate);
    }

    protected clear() {
        this.mix.clear();
        this.reverb.clear();
        this.shelvesL.clear();
        this.shelvesR.clear();
    }

    /**
     * Sets the balance and the 2-band EQ.
     * @param balance The balance parameter.
     * @param gain The output gain.
     * @param wetGain The wet signal's own gain.
     */
    protected setOutput(balance: number, gain: number, wetGain = 1) {
        const p = this.parameters;
        this.shelvesL.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelvesL.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        this.shelvesR.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelvesR.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        this.dry = balanceDry(balance) * gain;
        this.wet = balanceWet(balance) * gain * wetGain;
    }
}
