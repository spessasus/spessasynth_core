import { kaiser } from "./kaiser";

/**
 * The taps of the half band filter (odd, so one phase is a plain delay).
 */
const TAPS = 31;
const CENTER = (TAPS - 1) / 2;
const KAISER_BETA = 8;

/**
 * Twice the rate around a nonlinear stage: `up` makes two samples at the double rate, `down` takes two back.
 * Both use the same windowed sinc half band filter.
 * @internal
 */
export class Oversampler {
    /**
     * The two samples at the double rate after `up`.
     */
    public first = 0;
    public second = 0;
    private readonly taps = new Float64Array(TAPS);
    /**
     * The last inputs at the normal rate (`up`) and at the double rate (`down`).
     */
    private readonly input = new Float64Array(TAPS);
    private readonly doubled = new Float64Array(TAPS);

    public constructor() {
        for (let i = 0; i < TAPS; i++) {
            const t = (i - CENTER) / 2;
            const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
            this.taps[i] =
                0.5 * sinc * kaiser((i - CENTER) / CENTER, KAISER_BETA);
        }
    }

    public up(x: number) {
        const input = this.input;
        input.copyWithin(1, 0);
        input[0] = x;
        // Zero stuffing: the even taps make the first sample, the odd ones the second (times 2 for the zeros)
        let first = 0;
        let second = 0;
        for (let i = 0; i < TAPS; i += 2) first += this.taps[i] * input[i >> 1];
        for (let i = 1; i < TAPS; i += 2) {
            second += this.taps[i] * input[i >> 1];
        }
        this.first = 2 * first;
        this.second = 2 * second;
    }

    public down(first: number, second: number) {
        const doubled = this.doubled;
        doubled.copyWithin(2, 0);
        doubled[1] = first;
        doubled[0] = second;
        let y = 0;
        for (let i = 0; i < TAPS; i++) y += this.taps[i] * doubled[i];
        return y;
    }

    public clear() {
        this.input.fill(0);
        this.doubled.fill(0);
    }
}
