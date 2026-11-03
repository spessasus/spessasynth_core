import { panLeft, panRight } from "../glue";
import { OutputLag } from "./output_lag";

/**
 * The panned output of the mono wet types. Like on the hardware, the right output comes one 32 kHz sample after
 * the left one.
 * @internal
 */
export class MonoPan {
    public left = 0;
    public right = 0;
    private readonly lag: OutputLag;
    private gainL = 0;
    private gainR = 0;

    public constructor(sampleRate: number) {
        this.lag = new OutputLag(sampleRate);
    }

    /**
     * @param pan The pan parameter (0-127, 64 is the center).
     * @param gain The gain in front of the pan.
     */
    public set(pan: number, gain: number) {
        this.gainL = panLeft(pan) * gain;
        this.gainR = panRight(pan) * gain;
    }

    /**
     * Pans one sample into `left` and `right`.
     * @param x The mono sample.
     */
    public process(x: number) {
        this.left = x * this.gainL;
        this.right = this.lag.process(x * this.gainR);
    }

    public clear() {
        this.lag.clear();
    }
}
