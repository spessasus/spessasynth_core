import { GSEffect } from "../gs_effect";
import { levelGain, LINE_INPUT, STAGE_GAIN } from "../glue";
import type { DelayMemory } from "../blocks/delay_memory";
import { Delay } from "../blocks/delay";
import { MonoMix } from "../blocks/mono_mix";
import { StereoOutput } from "../blocks/stereo_output";
import { delay1, feedbackGain, hfDamp, STEP_MS } from "../conversion";

/**
 * The highest delay value of the taps, a higher one is taken as this (the Dly1 column's 1000 ms).
 * The column is 1000 ms from 115 up anyway, so only the stored byte changes. It is kept because SC-VA stores
 * the clamped byte too.
 */
const MAX_DELAY_VALUE = 115;

/**
 * Triple Tap and Quad Tap: the mono input into one line with several taps. Tap 1 feeds back through the HF damp,
 * the outputs take the raw taps, each with its gain per side.
 * The left output reads every tap one 32 kHz sample before the right output (the shared stage's timing).
 * @internal
 */
export abstract class GSTapDelay extends GSEffect {
    /**
     * Each tap's gain into the left and right outputs.
     */
    protected readonly gainsL: Float64Array;
    protected readonly gainsR: Float64Array;
    /**
     * The delay time parameters, tap by tap.
     */
    protected abstract readonly timeParameters: readonly number[];
    private readonly mix: MonoMix;
    /**
     * Reads 0 to n - 1 are the taps for the left output, n to 2n - 1 the same taps for the right.
     */
    private readonly delay: Delay;
    private readonly output: StereoOutput;
    private readonly tapCount: number;
    private feedback = 0;

    /**
     * @param sampleRate The sample rate.
     * @param memory The delay memory.
     * @param taps The number of taps.
     */
    protected constructor(
        sampleRate: number,
        memory: DelayMemory,
        taps: number
    ) {
        super(sampleRate, memory);
        this.tapCount = taps;
        this.gainsL = new Float64Array(taps);
        this.gainsR = new Float64Array(taps);
        this.mix = new MonoMix(sampleRate);
        this.delay = new Delay(sampleRate, memory, 2 * taps, 1000);
        // The right output's tap 1 is the line's own timing
        this.delay.setFeedbackTap(taps);
        this.output = new StereoOutput(sampleRate);
    }

    public setParameter(parameter: number, value: number) {
        if (this.timeParameters.includes(parameter)) {
            value = Math.min(value, MAX_DELAY_VALUE);
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
        const { delay, gainsL, gainsR, tapCount, output } = this;
        const taps = delay.output;
        for (let i = 0; i < sampleCount; i++) {
            const l = inputLeft[i];
            const r = inputRight[i];
            delay.process(
                this.mix.process(l, r) * LINE_INPUT +
                    delay.feedback() * this.feedback
            );
            let left = 0;
            let right = 0;
            for (let tap = 0; tap < tapCount; tap++) {
                left += gainsL[tap] * taps[tap];
                right += gainsR[tap] * taps[tap + tapCount];
            }
            output.process(l, left, r, right);
            outputLeft[i] = output.left;
            outputRight[i] = output.right;
        }
    }

    protected clear() {
        this.mix.clear();
        this.delay.clear();
        this.output.clear();
    }

    /**
     * Sets the taps, the loop and the output stage.
     * @param feedback The feedback parameter.
     * @param hf The HF damp parameter.
     */
    protected updateDelay(feedback: number, hf: number) {
        const p = this.parameters;
        for (let tap = 0; tap < this.tapCount; tap++) {
            const ms = delay1(p[this.timeParameters[tap]]);
            this.delay.setTap(tap, ms - STEP_MS);
            this.delay.setTap(tap + this.tapCount, ms);
        }
        this.feedback = feedbackGain(feedback);
        this.delay.setHFDamp(hfDamp(hf));
        this.output.set(
            this.controlled(1, 15),
            p[16],
            p[17],
            levelGain(p[19]) * STAGE_GAIN
        );
    }
}

/**
 * Triple Tap (`01 52`): center, left and right taps. The center goes to both sides and feeds back.
 * Parameters: 1-3 delay center, left, right (Dly1 column, up to 115), 4 feedback, 5-7 level center, left, right,
 * 8 HF damp, 16 balance, 17 low gain, 18 high gain, 20 level. EFX control source 1 modulates the feedback, source 2
 * the balance.
 * @internal
 */
export class GSTripleTapDelay extends GSTapDelay {
    public readonly type = 0x01_52;
    protected readonly defaults = new Uint8Array([
        0x14, 0x00, 0x07, 0x50, 0x7f, 0x7f, 0x7f, 0x7f, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x30, 0x40, 0x40, 0x00, 0x7f
    ]);
    protected readonly timeParameters = [0, 1, 2];

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, 3);
        this.reset();
    }

    protected update() {
        const p = this.parameters;
        this.gainsL[0] = this.gainsR[0] = levelGain(p[4]);
        this.gainsL[1] = levelGain(p[5]);
        this.gainsR[2] = levelGain(p[6]);
        this.updateDelay(this.controlled(0, 3), p[7]);
    }
}

/**
 * Quad Tap's fixed pans per tap, the left side (the right is the mirror image). The outer taps are inverted on
 * their main side, on the hardware too.
 */
const QUAD_PANS = [-103 / 128, 77 / 128, 51 / 128, 25 / 128];

/**
 * Quad Tap (`01 53`): four taps at fixed pans, tap 1 feeds back.
 * Parameters: 1-4 delays (Dly1 column, up to 115), 5-8 levels, 9 feedback, 10 HF damp, 16 balance, 17 low gain,
 * 18 high gain, 20 level. EFX control source 1 modulates the feedback, source 2 the balance.
 * @internal
 */
export class GSQuadTapDelay extends GSTapDelay {
    public readonly type = 0x01_53;
    protected readonly defaults = new Uint8Array([
        0x3c, 0x14, 0x28, 0x00, 0x7f, 0x7f, 0x7f, 0x7f, 0x50, 0x7f, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x30, 0x40, 0x40, 0x00, 0x7f
    ]);
    protected readonly timeParameters = [0, 1, 2, 3];

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, 4);
        this.reset();
    }

    protected update() {
        const p = this.parameters;
        for (let tap = 0; tap < 4; tap++) {
            const level = levelGain(p[4 + tap]);
            this.gainsL[tap] = level * QUAD_PANS[tap];
            this.gainsR[tap] = level * QUAD_PANS[3 - tap];
        }
        this.updateDelay(this.controlled(0, 8), p[9]);
    }
}
