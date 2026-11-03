import { DelayLine } from "./delay_line";

/**
 * The speaker gain of the network, and how long the speaker/phones switch ramps (in seconds).
 */
const SPEAKER = 0.921_875;
const RAMP = 0.04;

/**
 * The 3D types' output: phones pass the two ear signals, speakers cancel the crosstalk between the speakers.
 *
 * The side signal goes through `1 + 8 g z^-7 T(z)` with `T = (0.1015625 - 0.015625 z^-d) / (1 - 0.53125 z^-1 -
 * 0.3828125 z^-7)`, the mid signal is untouched (a recursive shuffler: the `z^-7` feedback cancels the cancellation
 * again). The delays are the hardware's 32 kHz samples in seconds, read with a Lagrange interpolator.
 * @internal
 */
export class OutputMode3D {
    public left = 0;
    public right = 0;
    private readonly ear1: DelayLine;
    private readonly ear2: DelayLine;
    private readonly shuffled1: DelayLine;
    private readonly shuffled2: DelayLine;
    /**
     * One 32 kHz sample in host samples.
     */
    private readonly step: number;
    /**
     * The numerator's delay in 32 kHz samples (12 for 3D Auto and Manual, 18 for 3D Chorus and Delay).
     */
    private readonly numerator: number;
    private readonly rampStep: number;
    private readonly ramped: boolean;
    private gain = SPEAKER;
    private target = SPEAKER;

    /**
     * @param sampleRate The sample rate.
     * @param numerator The numerator's delay in 32 kHz samples.
     * @param ramped Whether a switch ramps over 40 ms (else it is hard).
     */
    public constructor(sampleRate: number, numerator: number, ramped: boolean) {
        this.step = sampleRate / 32_000;
        this.numerator = numerator;
        this.ramped = ramped;
        this.rampStep = SPEAKER / (RAMP * sampleRate);
        this.ear1 = new DelayLine(Math.ceil(numerator * this.step) + 4);
        this.ear2 = new DelayLine(Math.ceil(numerator * this.step) + 4);
        this.shuffled1 = new DelayLine(Math.ceil(7 * this.step) + 4);
        this.shuffled2 = new DelayLine(Math.ceil(7 * this.step) + 4);
    }

    /**
     * @param phones Phones (no crosstalk canceller) instead of speakers.
     */
    public setPhones(phones: boolean) {
        this.target = phones ? 0 : SPEAKER;
        if (!this.ramped) this.gain = this.target;
    }

    /**
     * Puts the switch at its position at once (a reset).
     */
    public settle() {
        this.gain = this.target;
    }

    /**
     * @param e1 The left ear signal.
     * @param e2 The right ear signal.
     */
    public process(e1: number, e2: number) {
        const { step } = this;
        if (this.gain !== this.target) {
            this.gain =
                this.gain < this.target
                    ? Math.min(this.target, this.gain + this.rampStep)
                    : Math.max(this.target, this.gain - this.rampStep);
        }
        this.ear1.write(e1);
        this.ear2.write(e2);
        const t1 = this.shuffle(this.ear1, this.shuffled1);
        const t2 = this.shuffle(this.ear2, this.shuffled2);
        this.shuffled1.write(t1);
        this.shuffled2.write(t2);
        const side =
            4 *
            this.gain *
            (this.shuffled1.readLagrange(7 * step) -
                this.shuffled2.readLagrange(7 * step));
        this.left = e1 + side;
        this.right = e2 - side;
    }

    public clear() {
        this.ear1.clear();
        this.ear2.clear();
        this.shuffled1.clear();
        this.shuffled2.clear();
        this.left = this.right = 0;
    }

    /**
     * One ear's `T`: `0.1015625 e - 0.015625 e[d] + 0.53125 t[1] + 0.3828125 t[7]`, read before the write.
     * @param ear The ear signal's line (written this sample).
     * @param shuffled The shuffled signal's line (not yet written).
     */
    private shuffle(ear: DelayLine, shuffled: DelayLine) {
        const { step } = this;
        return (
            0.101_562_5 * ear.read(0) -
            0.015_625 * ear.readLagrange(this.numerator * step) +
            0.531_25 * shuffled.readLagrange(step - 1) +
            0.382_812_5 * shuffled.readLagrange(7 * step - 1)
        );
    }
}
