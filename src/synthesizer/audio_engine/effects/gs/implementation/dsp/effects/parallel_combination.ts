import type { DelayMemory } from "../blocks/delay_memory";
import { levelGain, STAGE_INPUT, STAGE_OUTPUT } from "../glue";
import { GSParallelEffect } from "./parallel_effect";
import { createParallelStage, type ParallelStage } from "./parallel_stage";
import type { ParallelStageType } from "../enums";

/**
 * An effect of a parallel combination and the gains around it. The programs differ in a 127/128 here and there:
 * the phaser of PH / Rotary and PH / AutoWah takes its input (and its dry signal) at 127/128, OD / Phaser's at
 * unity. PH / AutoWah's wah takes its input at 127/128 like the Auto Wah, OD / AutoWah's at unity and puts the
 * 127/128 after the filter.
 * @internal
 */
export interface ParallelStageSpec {
    type: ParallelStageType;
    /**
     * The gain in front of the effect, 1 if missing.
     */
    input?: number;
    /**
     * The gain after the effect, 1 if missing.
     */
    output?: number;
}

/**
 * The parallel combinations with a drive, phaser, auto wah or rotary (OD1 / OD2, OD / Rotary, OD / Phaser,
 * OD / AutoWah, PH / Rotary, PH / AutoWah). No EQ. Effect 1 takes parameters 1-5 and EFX control source 1,
 * effect 2 parameters 6-15 and source 2.
 * Unlike the chorus/flanger and delay combinations, there is no mix with the input around the effects (the phaser
 * has its own mix).
 * @internal
 */
export abstract class GSParallelCombination extends GSParallelEffect {
    private readonly first: ParallelStage;
    private readonly second: ParallelStage;
    private readonly firstInput: number;
    private readonly secondInput: number;
    private readonly firstOutput: number;
    private readonly secondOutput: number;

    protected constructor(
        sampleRate: number,
        memory: DelayMemory,
        first: ParallelStageSpec,
        second: ParallelStageSpec
    ) {
        super(sampleRate, memory);
        this.first = createParallelStage(first.type, sampleRate, memory);
        this.second = createParallelStage(second.type, sampleRate, memory);
        this.firstInput = (first.input ?? 1) * STAGE_INPUT;
        this.secondInput = (second.input ?? 1) * STAGE_INPUT;
        this.firstOutput = (first.output ?? 1) * STAGE_OUTPUT;
        this.secondOutput = (second.output ?? 1) * STAGE_OUTPUT;
    }

    public reset() {
        super.reset();
        this.first.settle();
        this.second.settle();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { first, second, firstInput, secondInput, gainL, gainR } = this;
        for (let i = 0; i < sampleCount; i++) {
            first.process(inputLeft[i] * firstInput);
            this.routeFirst(first.left);
            second.process(inputRight[i] * secondInput);
            outputLeft[i] = this.left + gainL * second.left;
            outputRight[i] =
                this.right +
                gainR *
                    (second.lagged
                        ? second.right
                        : this.lagSecond(second.right));
        }
    }

    protected clear() {
        super.clear();
        this.first.clear();
        this.second.clear();
    }

    protected update() {
        const p = this.parameters;
        const { first, second } = this;
        first.update(p, 0, this.controlled(0, first.target));
        second.update(p, 5, this.controlled(1, 5 + second.target));
        const level = levelGain(p[19]);
        this.updatePans(level * this.firstOutput, level * this.secondOutput);
    }
}
