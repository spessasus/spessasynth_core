import type { DelayMemory } from "../blocks/delay_memory";
import { levelGain } from "../glue";
import { Delay } from "../blocks/delay";
import { delay3, feedbackGain, hfDamp, STEP_MS } from "../conversion";
import { GSThreeDStageEffect } from "./three_d_stage_effect";

/**
 * The taps: center, left and right for the right output, then the same one 32 kHz sample earlier for the left one.
 * The delay parameters 1-3 come in the same order.
 */
const CENTER = 0;
const LEFT = 1;
const RIGHT = 2;
const EARLY = 3;

/**
 * 3D Delay (`01 57`): `L+R + feedback -> HF damp -> line`, the left and right taps through the 3D stage (at left and
 * right 90 degrees), the center tap to both sides, then the balance and the EQ.
 * Parameters: 1-3 center, left and right delay (Dly3 column), 4 feedback (from the center tap), 5-7 center, left and
 * right level, 8 HF damp, 15 output (speaker, phones), 16 balance, 17 low gain, 18 high gain, 20 level. EFX control
 * source 1 modulates the feedback, source 2 the balance.
 * @internal
 */
export class GSThreeDDelay extends GSThreeDStageEffect {
    public readonly type = 0x01_57;
    protected readonly defaults = new Uint8Array([
        0x74, 0x6a, 0x6e, 0x50, 0x28, 0x40, 0x40, 0x7f, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x30, 0x40, 0x40, 0x00, 0x7f
    ]);
    private readonly delay: Delay;
    private feedback = 0;
    private center = 0;
    private left = 0;
    private right = 0;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.delay = new Delay(sampleRate, memory, 6, 501);
        this.delay.setFeedbackTap(CENTER);
        this.delay.setDampTaps(true);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        const { delay, stageL, stageR, center, left, right, output } = this;
        const t = delay.output;
        for (let i = 0; i < sampleCount; i++) {
            const l = inputLeft[i];
            const r = inputRight[i];
            delay.process(
                this.mix.process(l, r) + delay.feedback() * this.feedback
            );
            stageL.process(left * t[EARLY + LEFT], right * t[EARLY + RIGHT]);
            stageR.process(left * t[LEFT], right * t[RIGHT]);
            output.process(
                l,
                stageL.left + center * t[EARLY + CENTER],
                r,
                stageR.right + center * t[CENTER]
            );
            outputLeft[i] = output.left;
            outputRight[i] = output.right;
        }
    }

    protected clear() {
        super.clear();
        this.delay.clear();
    }

    protected update() {
        const p = this.parameters;
        for (let tap = CENTER; tap <= RIGHT; tap++) {
            const ms = delay3(p[tap]);
            this.delay.setTap(tap, ms);
            this.delay.setTap(EARLY + tap, Math.max(0, ms - STEP_MS));
        }
        this.feedback = feedbackGain(this.controlled(0, 3));
        this.center = levelGain(p[4]);
        this.left = levelGain(p[5]);
        this.right = levelGain(p[6]);
        this.delay.setHFDamp(hfDamp(p[7]));
        this.updateStage();
    }
}
