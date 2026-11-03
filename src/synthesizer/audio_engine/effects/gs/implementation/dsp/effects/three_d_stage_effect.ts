import type { DelayMemory } from "../blocks/delay_memory";
import { GSEffect } from "../gs_effect";
import { levelGain, STAGE_GAIN } from "../glue";
import { MonoMix } from "../blocks/mono_mix";
import { Crosstalk3D } from "../blocks/crosstalk_3d";
import { StereoOutput } from "../blocks/stereo_output";

/**
 * 3D Chorus and 3D Delay: a mono effect whose left and right parts go through the 3D stage (at left and right
 * 90 degrees), then the balance and the EQ. Parameter 15 is the output (speaker, phones), EFX control source 2
 * modulates the balance.
 *
 * The shared stage reads the left input one 32 kHz sample late, so the left output hears the effect one sample
 * earlier than the right one: the left output comes from a second 3D stage fed by reads one sample earlier.
 * @internal
 */
export abstract class GSThreeDStageEffect extends GSEffect {
    protected readonly limits: Readonly<Record<number, number>> = { 14: 1 };
    protected readonly mix: MonoMix;
    protected readonly stageL: Crosstalk3D;
    protected readonly stageR: Crosstalk3D;
    protected readonly output: StereoOutput;

    protected constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.mix = new MonoMix(sampleRate);
        this.stageL = new Crosstalk3D(sampleRate);
        this.stageR = new Crosstalk3D(sampleRate);
        this.output = new StereoOutput(sampleRate);
    }

    protected clear() {
        this.mix.clear();
        this.stageL.clear();
        this.stageR.clear();
        this.output.clear();
    }

    /**
     * Sets the output mode, the balance, the EQ and the level.
     */
    protected updateStage() {
        const p = this.parameters;
        this.stageL.setPhones(p[14] === 1);
        this.stageR.setPhones(p[14] === 1);
        this.output.set(
            this.controlled(1, 15),
            p[16],
            p[17],
            levelGain(p[19]) * STAGE_GAIN
        );
    }
}
