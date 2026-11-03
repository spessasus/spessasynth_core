import { GSEffect } from "../gs_effect";
import { balanceDry, balanceWet, levelGain, STAGE_GAIN } from "../glue";
import type { DelayMemory } from "../blocks/delay_memory";
import { MonoMix } from "../blocks/mono_mix";
import { StereoOutput } from "../blocks/stereo_output";
import {
    type CombinationStage,
    createCombinationStage,
    STAGE_MIX_GAIN
} from "./combination_stage";
import type { CombinationStageType } from "../enums";
import { CombinationStages } from "../enums";

/**
 * The series combinations of a chorus or flanger: `L+R -> chorus/flanger -> balance`, the two sides mixed again
 * into the second stage, its balance, then the 2-band EQ.
 * Parameters 1-5 are the first stage (pre delay, rate, depth, feedback, balance), 6-10 the second, 17 low gain,
 * 18 high gain, 20 level.
 *
 * The shared stage reads the left input one 32 kHz sample late, so every mono line is read one sample earlier for
 * the left output than for the right one (as in the tap delays).
 * @internal
 */
export abstract class GSModulationSeries extends GSEffect {
    /**
     * The flanger instead of the chorus in the first stage.
     */
    private readonly flanger: boolean;
    private readonly mix: MonoMix;
    private readonly first: CombinationStage;
    private readonly secondMix: MonoMix;
    private readonly second: CombinationStage;
    private readonly output: StereoOutput;
    private firstDry = 0;
    private firstWet = 0;

    /**
     * @param sampleRate The sample rate.
     * @param memory The delay memory.
     * @param flanger The flanger instead of the chorus in the first stage.
     * @param stage The second stage.
     */
    protected constructor(
        sampleRate: number,
        memory: DelayMemory,
        flanger: boolean,
        stage: CombinationStageType
    ) {
        super(sampleRate, memory);
        this.flanger = flanger;
        this.mix = new MonoMix(sampleRate);
        this.first = createCombinationStage(
            flanger ? CombinationStages.flanger : CombinationStages.chorus,
            sampleRate,
            memory,
            -1
        );
        this.secondMix = new MonoMix(sampleRate);
        this.second = createCombinationStage(stage, sampleRate, memory, -1);
        this.output = new StereoOutput(sampleRate);
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { first, second, output, firstDry, firstWet } = this;
        for (let i = 0; i < sampleCount; i++) {
            const l = inputLeft[i];
            const r = inputRight[i];
            first.process(this.mix.process(l, r) * STAGE_MIX_GAIN);
            const left = firstDry * l + firstWet * first.left;
            const right = firstDry * r + firstWet * first.right;
            second.process(
                this.secondMix.process(left, right) * STAGE_MIX_GAIN
            );
            output.process(left, second.left, right, second.right);
            outputLeft[i] = output.left;
            outputRight[i] = output.right;
        }
    }

    protected clear() {
        this.mix.clear();
        this.first.clear();
        this.secondMix.clear();
        this.second.clear();
        this.output.clear();
    }

    protected update() {
        const p = this.parameters;
        // On the SC-88Pro source 1 moves the flanger's feedback, as the SC-8850 manual says (SC-VA moves its balance)
        this.first.update(p, 0, this.controlled(0, 3));
        const balance = this.flanger ? p[4] : this.controlled(0, 4);
        this.firstDry = balanceDry(balance);
        this.firstWet = balanceWet(balance);
        this.second.update(p, 5);
        this.output.set(
            this.controlled(1, 9),
            p[16],
            p[17],
            levelGain(p[19]) * STAGE_GAIN
        );
    }
}
