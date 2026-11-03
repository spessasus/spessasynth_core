import type { DelayMemory } from "../blocks/delay_memory";
import { GSEffect } from "../gs_effect";
import { levelGain, STAGE_GAIN } from "../glue";
import { Enhancer } from "../blocks/enhancer";
import { MonoMix } from "../blocks/mono_mix";
import { StereoOutput } from "../blocks/stereo_output";
import {
    type CombinationStage,
    createCombinationStage,
    STAGE_MIX_GAIN
} from "./combination_stage";
import type { CombinationStageType } from "../enums";

/**
 * The enhancer input's gain.
 */
const INPUT_GAIN = 127 / 128;

/**
 * EH -> Chorus, Flanger, Delay: a stereo enhancer is the dry signal, the mono sum of its sides feeds the chorus,
 * flanger or delay. Then the balance and the 2-band EQ per side.
 * Parameters: 1 sensitivity, 2 mix level, 6-9 the second stage, 10 balance, 17 low gain, 18 high gain, 20 level.
 * EFX control source 1 modulates the sensitivity, source 2 the balance.
 * @internal
 */
export abstract class GSEnhancerCombination extends GSEffect {
    private readonly enhancerL: Enhancer;
    private readonly enhancerR: Enhancer;
    private readonly mix: MonoMix;
    private readonly stage: CombinationStage;
    private readonly output: StereoOutput;
    private readonly enhanceRight: boolean;

    /**
     * @param sampleRate The sample rate.
     * @param memory The delay memory.
     * @param stage The second stage.
     * @param enhanceRight Enhance the right side too, else it only mixes the right enhancer's dry signal.
     */
    protected constructor(
        sampleRate: number,
        memory: DelayMemory,
        stage: CombinationStageType,
        enhanceRight: boolean
    ) {
        super(sampleRate, memory);
        this.enhanceRight = enhanceRight;
        this.enhancerL = new Enhancer(sampleRate);
        this.enhancerR = new Enhancer(sampleRate);
        this.mix = new MonoMix(sampleRate);
        this.stage = createCombinationStage(stage, sampleRate, memory, -1);
        this.output = new StereoOutput(sampleRate);
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { stage, output } = this;
        for (let i = 0; i < sampleCount; i++) {
            const l = this.enhancerL.process(inputLeft[i] * INPUT_GAIN);
            const r = this.enhancerR.process(inputRight[i] * INPUT_GAIN);
            stage.process(this.mix.process(l, r) * STAGE_MIX_GAIN);
            output.process(l, stage.left, r, stage.right);
            outputLeft[i] = output.left;
            outputRight[i] = output.right;
        }
    }

    protected clear() {
        this.enhancerL.clear();
        this.enhancerR.clear();
        this.mix.clear();
        this.stage.clear();
        this.output.clear();
    }

    protected update() {
        const p = this.parameters;
        // The sensitivity is 0 dB at 16 and grows linearly, the mix follows the level curve
        const sensitivity = Math.max(this.controlled(0, 0), 1) / 16;
        const mix = levelGain(p[1]);
        this.enhancerL.set(sensitivity, mix);
        this.enhancerR.set(this.enhanceRight ? sensitivity : 0, mix);
        this.stage.update(p, 5);
        this.output.set(
            this.controlled(1, 9),
            p[16],
            p[17],
            levelGain(p[19]) * STAGE_GAIN
        );
    }
}
