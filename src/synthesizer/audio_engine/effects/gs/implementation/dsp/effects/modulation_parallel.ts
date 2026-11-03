import {
    balanceDry,
    balanceWet,
    levelGain,
    LINE_INPUT,
    STAGE_GAIN
} from "../glue";
import type { DelayMemory } from "../blocks/delay_memory";
import { GSParallelEffect } from "./parallel_effect";
import {
    type CombinationStage,
    createCombinationStage,
    ModulationStage
} from "./combination_stage";
import type { CombinationStageType } from "../enums";

/**
 * The parallel combinations of a chorus or flanger: the left input runs through the chorus or flanger, the right
 * input through the second effect, each with its balance, level and pan. No EQ.
 * The chorus/flanger mixes two reads 180 degrees apart. Parameters 1-5 are the chorus/flanger (pre delay, rate,
 * depth, feedback, balance), 6-10 the second effect, 16-20 the pans and levels. EFX control source 1 modulates the
 * chorus/flanger balance, source 2 the second effect's.
 * The second effect's reads for the right output are one 32 kHz sample later (`GSParallelEffect`).
 * @internal
 */
export abstract class GSModulationParallel extends GSParallelEffect {
    private readonly first: ModulationStage;
    private readonly second: CombinationStage;
    private firstDry = 0;
    private firstWet = 0;
    private dry = 0;
    private wet = 0;

    /**
     * @param sampleRate The sample rate.
     * @param memory The delay memory.
     * @param flanger The flanger instead of the chorus on the left input.
     * @param stage The second effect.
     */
    protected constructor(
        sampleRate: number,
        memory: DelayMemory,
        flanger: boolean,
        stage: CombinationStageType
    ) {
        super(sampleRate, memory);
        this.first = new ModulationStage(sampleRate, memory, flanger, 0, true);
        this.second = createCombinationStage(stage, sampleRate, memory, 1);
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { first, second, firstDry, firstWet, dry, wet, gainL, gainR } =
            this;
        for (let i = 0; i < sampleCount; i++) {
            const l = inputLeft[i];
            const r = inputRight[i];
            second.process(r * LINE_INPUT);
            first.process(l * LINE_INPUT);
            this.routeFirst(firstDry * l + firstWet * first.left);
            outputLeft[i] = this.left + gainL * (dry * r + wet * second.left);
            outputRight[i] =
                this.right +
                gainR * (this.lagSecond(dry * r) + wet * second.right);
        }
    }

    protected clear() {
        super.clear();
        this.first.clear();
        this.second.clear();
    }

    protected update() {
        const p = this.parameters;
        this.first.update(p, 0);
        const first = this.controlled(0, 4);
        this.firstDry = balanceDry(first);
        this.firstWet = balanceWet(first);
        this.second.update(p, 5);
        const second = this.controlled(1, 9);
        this.dry = balanceDry(second);
        this.wet = balanceWet(second);
        const gain = levelGain(p[19]) * STAGE_GAIN;
        this.updatePans(gain, gain);
    }
}
