import { DelayLine } from "./delay_line";
import { FLUSH } from "./first_order_filter";

/**
 * A fixed delay of whole 32 kHz samples. The shared stage writes the right output one 32 kHz sample late, so every
 * type with a mono or a summed output delays its right side by one of these, and the mono mix its left input.
 *
 * Whole host samples read the line. Between them a Thiran allpass of order `floor(d) + 1` (stable, flat in
 * magnitude) gives the fractional delay: a Lagrange read lost 1.4 dB at 12 kHz on the delayed side at 44.1 kHz, the
 * allpass keeps both channels flat and the summed comb within 0.7 dB of the exact one.
 * @internal
 */
export class OutputLag {
    private readonly line: DelayLine | undefined;
    private readonly whole: number;
    /**
     * The allpass: `a` (a0 = 1 left out), the numerator is `a` reversed. Inputs and outputs, newest first.
     */
    private readonly a: Float64Array;
    private readonly inputs: Float64Array;
    private readonly outputs: Float64Array;

    /**
     * @param sampleRate The sample rate.
     * @param samples The delay in 32 kHz samples, 1 if missing.
     */
    public constructor(sampleRate: number, samples = 1) {
        const delay = (samples * sampleRate) / 32_000;
        this.whole = Math.round(delay);
        if (Math.abs(delay - this.whole) < 1e-9) {
            this.line = new DelayLine(this.whole);
            this.a = new Float64Array(0);
        } else {
            const order = Math.floor(delay) + 1;
            this.a = new Float64Array(order);
            // The coefficients a_k = (-1)^k C(order, k) prod_n (d - order + n) / (d - order + k + n)
            let binomial = 1;
            for (let k = 1; k <= order; k++) {
                binomial = (binomial * (order - k + 1)) / k;
                let p = 1;
                for (let n = 0; n <= order; n++) {
                    p *= (delay - order + n) / (delay - order + k + n);
                }
                this.a[k - 1] = (k % 2 === 0 ? 1 : -1) * binomial * p;
            }
        }
        this.inputs = new Float64Array(this.a.length + 1);
        this.outputs = new Float64Array(this.a.length);
    }

    /**
     * @param x This sample.
     * @returns The sample of the delay ago.
     */
    public process(x: number) {
        if (this.line !== undefined) {
            this.line.write(x);
            return this.line.read(this.whole);
        }
        const { a, inputs, outputs } = this;
        const order = a.length;
        // Plain loops, copyWithin costs more than the filter at these sizes
        for (let k = order; k > 0; k--) inputs[k] = inputs[k - 1];
        inputs[0] = x;
        // The numerator is the denominator reversed: b_k = a_(order - k), with a_0 = 1
        let y = inputs[order];
        for (let k = 1; k <= order; k++) {
            y += a[k - 1] * (inputs[order - k] - outputs[k - 1]);
        }
        if (Math.abs(y) < FLUSH) y = 0;
        for (let k = order - 1; k > 0; k--) outputs[k] = outputs[k - 1];
        outputs[0] = y;
        return y;
    }

    public clear() {
        this.line?.clear();
        this.inputs.fill(0);
        this.outputs.fill(0);
    }
}
