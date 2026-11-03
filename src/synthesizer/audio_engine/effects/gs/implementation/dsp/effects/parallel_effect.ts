import type { DelayMemory } from "../blocks/delay_memory";
import { GSEffect } from "../gs_effect";
import { levelGain, panLeft, panRight } from "../glue";
import { OutputLag } from "../blocks/output_lag";

/**
 * The base of the parallel combinations: effect 1 on the left input, effect 2 on the right input, each with its
 * pan (16, 18) and level (17, 19) into both outputs, then the output level (20).
 *
 * The shared stage reads the left input one 32 kHz sample late and writes the right output one sample late. So
 * effect 1 reaches the left output one 32 kHz sample late and the right output two late (`OutputLag`s), effect 2
 * the left output at once and the right one a sample late (`lagSecond`, the delay line effects read one sample
 * later for the right output instead).
 * @internal
 */
export abstract class GSParallelEffect extends GSEffect {
    /**
     * Effect 1's share of the outputs of this sample.
     */
    protected left = 0;
    protected right = 0;
    /**
     * Effect 2's pans with its level and the output level.
     */
    protected gainL = 0;
    protected gainR = 0;
    /**
     * Effect 1's lags to the left and the right output, effect 2's to the right one.
     */
    private readonly firstLagL: OutputLag;
    private readonly firstLagR: OutputLag;
    private readonly secondLag: OutputLag;
    private firstL = 0;
    private firstR = 0;

    protected constructor(sampleRate: number, memory?: DelayMemory) {
        super(sampleRate, memory);
        this.firstLagL = new OutputLag(sampleRate);
        this.firstLagR = new OutputLag(sampleRate, 2);
        this.secondLag = new OutputLag(sampleRate);
    }

    protected clear() {
        this.firstLagL.clear();
        this.firstLagR.clear();
        this.secondLag.clear();
    }

    /**
     * Pans effect 1's output into `left` and `right`.
     * @param y Effect 1's output.
     */
    protected routeFirst(y: number) {
        this.left = this.firstL * this.firstLagL.process(y);
        this.right = this.firstR * this.firstLagR.process(y);
    }

    /**
     * Effect 2's signal for the right output, one 32 kHz sample late.
     * @param x The signal.
     */
    protected lagSecond(x: number) {
        return this.secondLag.process(x);
    }

    /**
     * Applies the pans and levels (16-19).
     * @param first Effect 1's gain after its level (the output level, the output stage).
     * @param second Effect 2's.
     */
    protected updatePans(first: number, second: number) {
        const p = this.parameters;
        this.firstL = panLeft(p[15]) * levelGain(p[16]) * first;
        this.firstR = panRight(p[15]) * levelGain(p[16]) * first;
        this.gainL = panLeft(p[17]) * levelGain(p[18]) * second;
        this.gainR = panRight(p[17]) * levelGain(p[18]) * second;
    }
}
