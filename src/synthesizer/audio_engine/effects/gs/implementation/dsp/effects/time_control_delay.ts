import { GSEffect } from "../gs_effect";
import { levelGain, LINE_INPUT, panLeft, panRight, STAGE_GAIN } from "../glue";
import type { DelayMemory } from "../blocks/delay_memory";
import { Delay } from "../blocks/delay";
import { MonoMix } from "../blocks/mono_mix";
import { StereoOutput } from "../blocks/stereo_output";
import { delay2, feedbackGain, hfDamp, slewTime } from "../conversion";

/**
 * Time Ctrl Delay (`01 54`): a mono delay whose time slews toward the delay parameter, so changing it bends the
 * pitch. The HF damp is in the loop, the output is panned.
 * The time is the Dly2 column x 127/128 (on the hardware too), the full 200 to 1000 ms (SC-VA wraps above 256 ms).
 * The left output reads one 32 kHz sample before the right one (the shared stage's timing).
 * Parameters: 1 delay (Dly2 column), 2 acceleration, 3 feedback, 4 HF damp, 5 pan, 16 balance, 17 low gain, 18 high
 * gain, 20 level. EFX control source 1 modulates the delay, source 2 the feedback.
 * @internal
 */
export class GSTimeControlDelay extends GSEffect {
    public readonly type = 0x01_54;
    protected readonly defaults = new Uint8Array([
        0x3c, 0x50, 0x50, 0x7f, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x30, 0x40, 0x40, 0x00, 0x7f
    ]);
    private readonly mix: MonoMix;
    /**
     * Tap 0 is the left output's read, tap 1 the right one's (and the feedback).
     */
    private readonly delay: Delay;
    private readonly output: StereoOutput;
    /**
     * The delay and its target in 32 kHz samples.
     */
    private position = 0;
    private target = 0;
    private slew = 0;
    private feedback = 0;
    private panL = 0;
    private panR = 0;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.mix = new MonoMix(sampleRate);
        this.delay = new Delay(sampleRate, memory, 2, 1000);
        this.delay.setFeedbackTap(1);
        this.delay.setDampTaps(true);
        // The time slews by itself
        this.delay.setCrossfade(false);
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
        const { delay, panL, panR, output } = this;
        for (let i = 0; i < sampleCount; i++) {
            const l = inputLeft[i];
            const r = inputRight[i];
            this.position += this.slew * (this.target - this.position);
            delay.setTap(0, (this.position - 1) / 32);
            delay.setTap(1, this.position / 32);
            delay.process(
                this.mix.process(l, r) * LINE_INPUT +
                    delay.feedback() * this.feedback
            );
            output.process(
                l,
                panL * delay.output[0],
                r,
                panR * delay.output[1]
            );
            outputLeft[i] = output.left;
            outputRight[i] = output.right;
        }
    }

    protected clear() {
        this.mix.clear();
        this.delay.clear();
        this.output.clear();
        // The time slews up from zero after a type select
        this.position = 0;
    }

    protected update() {
        const p = this.parameters;
        this.target = ((delay2(this.controlled(0, 0)) * 127) / 128) * 32;
        // The slew per 32 kHz sample is 1 / (32000 x the time constant)
        const step = 1 / (32_000 * slewTime(p[1]));
        this.slew = 1 - (1 - step) ** (32_000 / this.sampleRate);
        this.feedback = feedbackGain(this.controlled(1, 2));
        this.delay.setHFDamp(hfDamp(p[3]));
        this.panL = panLeft(p[4]);
        this.panR = panRight(p[4]);
        this.output.set(p[15], p[16], p[17], levelGain(p[19]) * STAGE_GAIN);
    }
}
