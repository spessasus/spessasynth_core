import { GSEffect } from "../gs_effect";
import {
    levelGain,
    MONO_INPUT,
    saturateAt,
    SATURATED_INPUT,
    SATURATED_OUTPUT,
    shelfGain,
    STAGE_OUTPUT
} from "../glue";
import { MonoMix } from "../blocks/mono_mix";
import type { Dynamics } from "../blocks/dynamics";
import { ShelfCorners, ShelfEQ } from "../blocks/shelf_eq";
import { MonoPan } from "../blocks/mono_pan";

/**
 * The post gains (0, +6, +12 and +18 dB, the last one is 2 x 127/32).
 */
const POST_GAINS = [1, 2, 4, (2 * 127) / 32];

/**
 * Compressor and Limiter: `L+R -> dynamics -> EQ -> pan`.
 * Parameters 17 low gain, 18 high gain, 19 pan, 20 level. EFX control source 1 modulates the pan, source 2 the
 * level.
 * @internal
 */
export abstract class GSDynamicsEffect extends GSEffect {
    protected abstract readonly dynamics: Dynamics;
    /**
     * The fixed gain in front of the post gain.
     */
    protected abstract readonly preGain: number;
    private readonly mix: MonoMix;
    private readonly shelves: ShelfEQ;
    private readonly pan: MonoPan;

    protected constructor(sampleRate: number) {
        super(sampleRate);
        this.mix = new MonoMix(sampleRate);
        this.shelves = new ShelfEQ(sampleRate);
        this.pan = new MonoPan(sampleRate);
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        for (let i = 0; i < sampleCount; i++) {
            const x = this.mix.process(
                saturateAt(inputLeft[i], SATURATED_INPUT),
                saturateAt(inputRight[i], SATURATED_INPUT)
            );
            this.pan.process(
                this.shelves.process(this.dynamics.process(x * MONO_INPUT))
            );
            const l = this.pan.left;
            const r = this.pan.right;
            outputLeft[i] = saturateAt(l, SATURATED_OUTPUT);
            outputRight[i] = saturateAt(r, SATURATED_OUTPUT);
        }
    }

    protected clear() {
        this.mix.clear();
        this.dynamics.clear();
        this.shelves.clear();
        this.pan.clear();
    }

    protected update() {
        const p = this.parameters;
        this.shelves.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelves.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        this.dynamics.setPostGain(
            POST_GAINS[this.updateDynamics()] * this.preGain
        );
        // The EQ input has one more 127/128 than the output stage
        this.pan.set(
            this.controlled(0, 18),
            (levelGain(this.controlled(1, 19)) * STAGE_OUTPUT * 127) / 128
        );
    }

    /**
     * Applies the type's parameters to the dynamics block.
     * @returns The post gain index (0-3).
     */
    protected abstract updateDynamics(): number;
}
