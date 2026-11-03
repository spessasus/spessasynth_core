import type { DelayMemory } from "../blocks/delay_memory";
import { LFO } from "../blocks/lfo";
import { ModulatedDelay } from "../blocks/modulated_delay";
import { Delay } from "../blocks/delay";
import {
    delay3,
    feedbackGain,
    hfDamp,
    modulationDepth,
    preDelay,
    rate1,
    STEP_MS,
    SWING_MS
} from "../conversion";
import type { CombinationStageType } from "../enums";
import { CombinationStages } from "../enums";

/**
 * A line fed by a mono mix of both sides: a quarter of each side (the mono mix halves them) and the 127/128 into
 * the line.
 * @internal
 */
export const STAGE_MIX_GAIN = (0.5 * 127) / 128;

/**
 * One effect of the series and parallel combinations, with an output for the left and the right side. Its
 * parameters start at 1 or 6 (`base`), and the type may hand it one of them moved by an EFX control source.
 * @internal
 */
export abstract class CombinationStage {
    /**
     * The outputs of this sample (the same for the mono effects).
     */
    public left = 0;
    public right = 0;

    /**
     * @param parameters The type's parameters.
     * @param base The index of the stage's first parameter (0 or 5).
     * @param control The parameter the type's EFX control source moves in this stage, with the offset added.
     */
    public abstract update(
        parameters: Uint8Array,
        base: number,
        control?: number
    ): void;

    /**
     * @param x The input, without the feedback.
     */
    public abstract process(x: number): void;

    public abstract clear(): void;

    /**
     * Called after a type select.
     */
    public settle() {
        // Only the rotary has something to settle
    }
}

/**
 * The chorus or flanger: pre delay, rate (Rate1 column), depth, feedback (flanger) from `base` on.
 * Read 0 sits at the pre delay and feeds back, the skewed side's read (or pair) is next in the read order.
 *
 * In the series, drive and enhancer combinations each side has one read. The right one is 180 degrees off
 * (chorus) or in phase (flanger, on the hardware too). The right read feeds back, which is the left one on the
 * hardware: only the flanger has feedback and its reads are in phase.
 * In the parallel combinations each side mixes two reads 180 degrees apart at half level (`paired`), the flanger
 * too.
 * @internal
 */
export class ModulationStage extends CombinationStage {
    private readonly lfo: LFO;
    private readonly delay: ModulatedDelay;
    private readonly flanger: boolean;
    private readonly paired: boolean;
    /**
     * Each read's offset from the pre delay in ms.
     */
    private readonly offsets: Float64Array;
    /**
     * The first read of each side.
     */
    private readonly leftRead: number;
    private readonly rightRead: number;

    /**
     * @param sampleRate The sample rate.
     * @param memory The delay memory.
     * @param flanger The flanger (the squared curve, the feedback) instead of the chorus.
     * @param skew The skewed side, see `createCombinationStage`.
     * @param paired Two reads for each side.
     */
    public constructor(
        sampleRate: number,
        memory: DelayMemory,
        flanger: boolean,
        skew: number,
        paired: boolean
    ) {
        super();
        this.flanger = flanger;
        this.paired = paired;
        const perSide = paired ? 2 : 1;
        // A paired stage that is not skewed has one pair for both sides
        const skewed = paired && skew === 0 ? 0 : perSide;
        this.offsets = new Float64Array(skewed + perSide);
        this.offsets.fill(skew * STEP_MS, skewed);
        this.leftRead = skew > 0 ? 0 : skewed;
        this.rightRead = skew > 0 ? skewed : 0;
        this.lfo = new LFO(sampleRate);
        this.delay = new ModulatedDelay(
            sampleRate,
            memory,
            this.offsets.length,
            101 + SWING_MS
        );
        this.delay.setCurve(flanger);
        if (paired) {
            for (let read = 1; read < this.offsets.length; read += 2) {
                this.delay.setPhase(read, 180);
            }
        } else {
            this.delay.setPhase(this.rightRead, flanger ? 0 : 180);
        }
    }

    /**
     * @param parameters The type's parameters.
     * @param base The index of the pre delay.
     * @param feedback The feedback parameter (FL -> Delay moves it with EFX control source 1).
     */
    public update(
        parameters: Uint8Array,
        base: number,
        feedback = parameters[base + 3]
    ) {
        const { delay, offsets } = this;
        const pre = preDelay(parameters[base]);
        const depth = modulationDepth(parameters[base + 2]);
        this.lfo.setRate(rate1(parameters[base + 1]));
        for (let read = 0; read < offsets.length; read++) {
            delay.setPreDelay(read, pre + offsets[read]);
            delay.setDepth(read, depth);
        }
        delay.setFeedback(this.flanger ? feedbackGain(feedback) : 0);
    }

    public process(x: number) {
        const { delay, leftRead, rightRead } = this;
        delay.process(x, this.lfo.process());
        const reads = delay.output;
        if (this.paired) {
            this.left = (reads[leftRead] + reads[leftRead + 1]) * 0.5;
            this.right = (reads[rightRead] + reads[rightRead + 1]) * 0.5;
        } else {
            this.left = reads[leftRead];
            this.right = reads[rightRead];
        }
    }

    public clear() {
        this.lfo.clear();
        this.delay.clear();
    }
}

/**
 * The delay: delay (Dly3 column), feedback, HF damp (on the echoes and in the loop) from `base` on.
 * Tap 0 sits at the delay and feeds back, tap 1 is the skewed side's.
 */
class DelayStage extends CombinationStage {
    private readonly delay: Delay;
    /**
     * The skewed tap's offset in ms.
     */
    private readonly skew: number;
    private readonly leftTap: number;
    private readonly rightTap: number;
    private feedback = 0;

    public constructor(sampleRate: number, memory: DelayMemory, skew: number) {
        super();
        this.skew = skew * STEP_MS;
        this.leftTap = skew > 0 ? 0 : 1;
        this.rightTap = skew > 0 ? 1 : 0;
        this.delay = new Delay(sampleRate, memory, 2, 500);
        this.delay.setDampTaps(true);
    }

    public update(parameters: Uint8Array, base: number) {
        const time = delay3(parameters[base]);
        this.delay.setTap(0, time);
        // The shortest delay is one 32 kHz sample, so an earlier tap is never ahead of the input
        this.delay.setTap(1, time + this.skew);
        this.feedback = feedbackGain(parameters[base + 1]);
        this.delay.setHFDamp(hfDamp(parameters[base + 2]));
    }

    public process(x: number) {
        const { delay } = this;
        delay.process(x + delay.feedback() * this.feedback);
        this.left = delay.output[this.leftTap];
        this.right = delay.output[this.rightTap];
    }

    public clear() {
        this.delay.clear();
    }
}

/**
 * Builds a chorus, flanger or delay stage. Call it after the type's `GSEffect` constructor, which rewinds the delay
 * memory.
 *
 * The shared stage reads the left input one 32 kHz sample late and writes the right output one sample late, so
 * the two sides read the line a sample apart: -1 for the left read one sample earlier (a line fed from both
 * inputs), 1 for the right read one sample later (the parallel combinations' effect 2, whose chorus/flanger mixes
 * two reads per side), 0 for neither (the drive combinations, whose dry signal is as late as the line's input).
 * @param type The stage.
 * @param sampleRate The sample rate.
 * @param memory The delay memory.
 * @param skew The skewed side: -1, 0 or 1.
 * @internal
 */
export function createCombinationStage(
    type: CombinationStageType,
    sampleRate: number,
    memory: DelayMemory,
    skew: number
) {
    return type === CombinationStages.delay
        ? new DelayStage(sampleRate, memory, skew)
        : new ModulationStage(
              sampleRate,
              memory,
              type === CombinationStages.flanger,
              skew,
              skew > 0
          );
}
