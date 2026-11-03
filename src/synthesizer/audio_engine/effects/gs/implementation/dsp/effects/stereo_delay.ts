import { GSEffect } from "../gs_effect";
import { levelGain, LINE_INPUT, STAGE_GAIN } from "../glue";
import type { DelayMemory } from "../blocks/delay_memory";
import { Delay } from "../blocks/delay";
import { StereoOutput } from "../blocks/stereo_output";
import { delay3, feedbackGain, hfDamp } from "../conversion";

/**
 * Stereo Delay (`01 50`): a delay per channel with the HF damp in the loop. The feedback goes back into its own line
 * (normal) or the other one (cross). An inverted output is also 6 dB quieter, on the hardware too.
 * Parameters: 1 delay left, 2 delay right (Dly3 column), 3 feedback, 4 feedback mode (normal, cross), 5 phase left,
 * 6 phase right (normal, invert), 8 HF damp, 16 balance, 17 low gain, 18 high gain, 20 level. EFX control source 1
 * modulates the feedback, source 2 the balance.
 * @internal
 */
export class GSStereoDelay extends GSEffect {
    public readonly type = 0x01_50;
    protected readonly defaults = new Uint8Array([
        0x65, 0x74, 0x58, 0x01, 0x00, 0x00, 0x00, 0x7f, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x30, 0x40, 0x40, 0x00, 0x7f
    ]);
    protected readonly limits = { 3: 1, 4: 1, 5: 1 };
    private readonly delayL: Delay;
    private readonly delayR: Delay;
    private readonly output: StereoOutput;
    private cross = false;
    private feedback = 0;
    private phaseL = 1;
    private phaseR = 1;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.delayL = new Delay(sampleRate, memory, 1, 500);
        this.delayR = new Delay(sampleRate, memory, 1, 500);
        this.delayL.setDampTaps(true);
        this.delayR.setDampTaps(true);
        this.output = new StereoOutput(sampleRate);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { delayL, delayR, feedback, phaseL, phaseR, output } = this;
        for (let i = 0; i < sampleCount; i++) {
            const l = inputLeft[i];
            const r = inputRight[i];
            if (this.cross) {
                // The shared stage runs the left chain one 32 kHz sample behind the right one
                // So the left echo reaches the right line two samples later
                // The right echo reaches the left line in the same sample
                delayR.process(r * LINE_INPUT + delayL.feedback(2) * feedback);
                delayL.process(l * LINE_INPUT + delayR.output[0] * feedback);
            } else {
                delayL.process(l * LINE_INPUT + delayL.feedback() * feedback);
                delayR.process(r * LINE_INPUT + delayR.feedback() * feedback);
            }
            output.process(
                l,
                phaseL * delayL.output[0],
                r,
                phaseR * delayR.output[0]
            );
            outputLeft[i] = output.left;
            outputRight[i] = output.right;
        }
    }

    protected clear() {
        this.delayL.clear();
        this.delayR.clear();
        this.output.clear();
    }

    protected update() {
        const p = this.parameters;
        this.delayL.setTap(0, delay3(p[0]));
        this.delayR.setTap(0, delay3(p[1]));
        this.feedback = feedbackGain(this.controlled(0, 2));
        this.cross = p[3] === 1;
        this.phaseL = p[4] === 1 ? -0.5 : 1;
        this.phaseR = p[5] === 1 ? -0.5 : 1;
        this.delayL.setHFDamp(hfDamp(p[7]));
        this.delayR.setHFDamp(hfDamp(p[7]));
        this.output.set(
            this.controlled(1, 15),
            p[16],
            p[17],
            levelGain(p[19]) * STAGE_GAIN
        );
    }
}
