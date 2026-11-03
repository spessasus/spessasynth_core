import { GSEffect } from "../gs_effect";
import { levelGain, STAGE_GAIN } from "../glue";
import type { DelayMemory } from "../blocks/delay_memory";
import { MonoMix } from "../blocks/mono_mix";
import { PitchShifter } from "../blocks/pitch_shifter";
import { StereoOutput } from "../blocks/stereo_output";

/**
 * The pitch shifters: the mono input into a `PitchShifter`, each voice panned, then the balance and the 2-band EQ.
 * The left output takes the voices one 32 kHz sample ahead of the right (the shared stage's timing).
 * @internal
 */
export abstract class GSPitchShifterEffect extends GSEffect {
    /**
     * Each voice's gain into the left and right outputs.
     */
    protected readonly gainsL: Float64Array;
    protected readonly gainsR: Float64Array;
    protected readonly shifter: PitchShifter;
    /**
     * The mono input's gain into the line.
     */
    protected abstract readonly inputGain: number;
    /**
     * The fine pitch parameters, clamped to -100 to +100 cents (14-114).
     */
    protected abstract readonly fineParameters: readonly number[];
    private readonly mix: MonoMix;
    private readonly output: StereoOutput;

    /**
     * @param sampleRate The sample rate.
     * @param memory The delay memory.
     * @param voices The number of voices.
     */
    protected constructor(
        sampleRate: number,
        memory: DelayMemory,
        voices: number
    ) {
        super(sampleRate, memory);
        this.gainsL = new Float64Array(voices);
        this.gainsR = new Float64Array(voices);
        this.mix = new MonoMix(sampleRate);
        this.shifter = new PitchShifter(sampleRate, memory, voices);
        this.output = new StereoOutput(sampleRate);
    }

    public setParameter(parameter: number, value: number) {
        if (this.fineParameters.includes(parameter)) {
            value = Math.max(14, Math.min(114, value));
        }
        super.setParameter(parameter, value);
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { shifter, gainsL, gainsR, output } = this;
        for (let i = 0; i < sampleCount; i++) {
            const l = inputLeft[i];
            const r = inputRight[i];
            shifter.process(this.mix.process(l, r) * this.inputGain);
            let left = 0;
            let right = 0;
            for (let v = 0; v < gainsL.length; v++) {
                left += gainsL[v] * shifter.early[v];
                right += gainsR[v] * shifter.output[v];
            }
            output.process(l, left, r, right);
            outputLeft[i] = output.left;
            outputRight[i] = output.right;
        }
    }

    protected clear() {
        this.mix.clear();
        this.shifter.clear();
        this.output.clear();
    }

    /**
     * Sets the balance and the 2-band EQ.
     */
    protected updateOutput() {
        const p = this.parameters;
        this.output.set(p[15], p[16], p[17], levelGain(p[19]) * STAGE_GAIN);
    }
}
