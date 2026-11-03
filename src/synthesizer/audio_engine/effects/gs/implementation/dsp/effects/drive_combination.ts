import type { DelayMemory } from "../blocks/delay_memory";
import { OutputLag } from "../blocks/output_lag";
import { GSEffect } from "../gs_effect";
import {
    levelGain,
    LINE_INPUT,
    MONO_INPUT,
    panLeft,
    panRight,
    STAGE_OUTPUT
} from "../glue";
import { MonoMix } from "../blocks/mono_mix";
import { Drive, type DrivePreset } from "../blocks/drive";
import { AmpSimulator } from "../blocks/amp_simulator";
import { StereoOutput } from "../blocks/stereo_output";
import {
    type CombinationStage,
    createCombinationStage
} from "./combination_stage";
import type { CombinationStageType } from "../enums";

/**
 * OD and DS -> Chorus, Flanger, Delay: `L+R -> drive -> amp simulator -> pan`, the panned drive is the dry signal
 * and its mono sum feeds the chorus, flanger or delay. Then the balance and the 2-band EQ per side.
 * Parameters: 1 drive, 2 drive pan, 3 amp type, 4 amp switch, 6-9 the second stage, 10 balance, 17 low gain,
 * 18 high gain, 20 level. EFX control source 1 modulates the drive pan, source 2 the balance.
 *
 * Like the other mono input types the right output comes one 32 kHz sample after the left one.
 * @internal
 */
export abstract class GSDriveCombination extends GSEffect {
    protected readonly limits = { 2: 3, 3: 1 };
    protected abstract readonly preset: DrivePreset;
    private readonly mix: MonoMix;
    private readonly drive: Drive;
    private readonly amp: AmpSimulator;
    private readonly stage: CombinationStage;
    private readonly output: StereoOutput;
    private readonly lag: OutputLag;
    private ampOn = false;
    private panL = 0;
    private panR = 0;
    private lineGain = 0;

    protected constructor(
        sampleRate: number,
        memory: DelayMemory,
        stage: CombinationStageType
    ) {
        super(sampleRate, memory);
        this.mix = new MonoMix(sampleRate);
        this.drive = new Drive(sampleRate);
        this.amp = new AmpSimulator(sampleRate);
        // The dry signal is the drive's output, as late as the line's input, so the reads take nothing off
        this.stage = createCombinationStage(stage, sampleRate, memory, 0);
        this.output = new StereoOutput(sampleRate);
        this.lag = new OutputLag(sampleRate);
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
            let y = this.drive.process(
                this.mix.process(inputLeft[i], inputRight[i]) * MONO_INPUT
            );
            // The amp runs when it is switched off too, so switching it on does not click
            const amp = this.amp.process(y);
            if (this.ampOn) y = amp;
            stage.process(y * this.lineGain);
            output.process(
                this.panL * y,
                stage.left,
                this.panR * y,
                stage.right
            );
            outputLeft[i] = output.left;
            outputRight[i] = this.lag.process(output.right);
        }
    }

    protected clear() {
        this.mix.clear();
        this.drive.clear();
        this.amp.clear();
        this.stage.clear();
        this.output.clear();
        this.lag.clear();
    }

    protected update() {
        const p = this.parameters;
        this.drive.setPreset(this.preset);
        this.drive.setDrive(p[0]);
        this.amp.setType(p[2]);
        this.ampOn = p[3] === 1;
        const pan = this.controlled(0, 1);
        this.panL = panLeft(pan);
        this.panR = panRight(pan);
        // The line takes the mono sum of the panned drive
        this.lineGain = ((this.panL + this.panR) / 2) * LINE_INPUT;
        this.stage.update(p, 5);
        this.output.set(
            this.controlled(1, 9),
            p[16],
            p[17],
            levelGain(p[19]) * STAGE_OUTPUT
        );
    }
}
