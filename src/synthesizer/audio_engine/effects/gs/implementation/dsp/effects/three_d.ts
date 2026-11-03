import { GSEffect } from "../gs_effect";
import { OutputLag } from "../blocks/output_lag";
import { levelGain, STAGE_GAIN } from "../glue";
import { MonoMix } from "../blocks/mono_mix";
import { Positioner3D } from "../blocks/positioner_3d";
import { OutputMode3D } from "../blocks/output_mode_3d";

/**
 * 3D Auto and 3D Manual: `L+R -> positioner -> output mode`.
 * The right output comes one 32 kHz sample after the left one, as from the shared stage (it adds to the time
 * between the ears).
 * @internal
 */
export abstract class GSThreeD extends GSEffect {
    protected readonly limits: Readonly<Record<number, number>> = { 14: 1 };
    protected readonly positioner: Positioner3D;
    private readonly mix: MonoMix;
    private readonly output: OutputMode3D;
    private readonly lag: OutputLag;
    private gain = 0;

    protected constructor(sampleRate: number) {
        super(sampleRate);
        this.mix = new MonoMix(sampleRate);
        this.positioner = new Positioner3D(sampleRate);
        this.output = new OutputMode3D(sampleRate, 12, true);
        this.lag = new OutputLag(sampleRate);
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { positioner, output, gain } = this;
        for (let i = 0; i < sampleCount; i++) {
            positioner.process(this.mix.process(inputLeft[i], inputRight[i]));
            output.process(positioner.left, positioner.right);
            outputLeft[i] = output.left * gain;
            outputRight[i] = this.lag.process(output.right * gain);
        }
    }

    public reset() {
        super.reset();
        this.output.settle();
    }

    protected clear() {
        this.mix.clear();
        this.positioner.clear();
        this.output.clear();
        this.lag.clear();
    }

    protected update() {
        this.output.setPhones(this.parameters[14] === 1);
        this.gain = levelGain(this.level()) * STAGE_GAIN;
        this.updatePosition();
    }

    /**
     * The level parameter with its EFX control.
     */
    protected abstract level(): number;

    /**
     * Applies the azimuth and the turning.
     */
    protected abstract updatePosition(): void;
}
