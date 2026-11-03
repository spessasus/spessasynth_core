import { kaiser } from "./kaiser";

/**
 * The band-limited read: a Kaiser windowed sinc of 16 taps (beta 8), 7 of them newer than the delay.
 * Within 1.1e-4 of an exact fractional delay up to 0.28 fs (12.5 kHz at 44.1 kHz).
 */
const SINC_TAPS = 16;
const SINC_NEWER = 7;
const SINC_PHASES = 1024;

/**
 * One row of taps per fraction (0 to 1 in `SINC_PHASES` steps), each row normalized to unity at DC.
 */
const SINC_TABLE = new Float32Array((SINC_PHASES + 1) * SINC_TAPS);
for (let phase = 0; phase <= SINC_PHASES; phase++) {
    const row = phase * SINC_TAPS;
    let sum = 0;
    for (let k = 0; k < SINC_TAPS; k++) {
        const t = k - SINC_NEWER - phase / SINC_PHASES;
        const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
        const v = sinc * kaiser(t / (SINC_TAPS / 2), 8);
        SINC_TABLE[row + k] = v;
        sum += v;
    }
    for (let k = 0; k < SINC_TAPS; k++) SINC_TABLE[row + k] /= sum;
}

/**
 * A delay line in samples. Write one sample, then read any delay up to the length it was made with.
 * A delay of 0 reads the sample just written.
 * @internal
 */
export class DelayLine {
    /**
     * The samples (a power of two). Long lines are a view of the shared `DelayMemory`, which may move them.
     */
    public buffer: Float32Array;
    private readonly mask: number;
    private position = 0;

    /**
     * @param maxDelay The longest delay that will be read, in samples.
     * @param buffer The memory to use (`sizeFor(maxDelay)` samples), its own if missing.
     */
    public constructor(maxDelay: number, buffer?: Float32Array) {
        this.buffer = buffer ?? new Float32Array(DelayLine.sizeFor(maxDelay));
        this.mask = this.buffer.length - 1;
    }

    /**
     * The buffer size a line needs for a delay, with room for the band-limited read's older taps.
     * @param maxDelay The longest delay that will be read, in samples.
     */
    public static sizeFor(maxDelay: number) {
        let size = 2;
        while (size < maxDelay + SINC_TAPS - SINC_NEWER + 2) size *= 2;
        return size;
    }

    public write(x: number) {
        this.position = (this.position + 1) & this.mask;
        this.buffer[this.position] = x;
    }

    /**
     * @param delay The delay in whole samples.
     */
    public read(delay: number) {
        return this.buffer[(this.position - delay) & this.mask];
    }

    /**
     * Reads between two samples, linearly interpolated.
     * @param delay The delay in samples.
     */
    public readLinear(delay: number) {
        const whole = Math.floor(delay);
        const a = this.buffer[(this.position - whole) & this.mask];
        const b = this.buffer[(this.position - whole - 1) & this.mask];
        return a + (b - a) * (delay - whole);
    }

    /**
     * Reads between samples through the band-limited interpolator (whole delays read directly).
     * Delays shorter than its newer taps fall back to the Lagrange read.
     * @param delay The delay in samples.
     */
    public readSinc(delay: number) {
        const whole = Math.floor(delay);
        const fraction = delay - whole;
        if (fraction === 0)
            return this.buffer[(this.position - whole) & this.mask];
        if (whole < SINC_NEWER) return this.readLagrange(delay);
        const row = Math.round(fraction * SINC_PHASES) * SINC_TAPS;
        const newest = this.position - whole + SINC_NEWER;
        let y = 0;
        for (let k = 0; k < SINC_TAPS; k++) {
            y += SINC_TABLE[row + k] * this.buffer[(newest - k) & this.mask];
        }
        return y;
    }

    /**
     * Reads between samples through a 4-point Lagrange interpolator, which needs no newer samples (the short delays
     * inside a loop). Its points start at the newest sample at the earliest, so very short delays lean on the older
     * side. Whole delays read directly. A negative delay reads the newest sample: extrapolating past it made the
     * 3D loops unstable below 22.05 kHz.
     * @param delay The delay in samples.
     */
    public readLagrange(delay: number) {
        if (delay <= 0) return this.buffer[this.position & this.mask];
        const whole = Math.floor(delay);
        const m = delay - whole;
        if (m === 0) return this.buffer[(this.position - whole) & this.mask];
        // The points sit at whole - 1 to whole + 2, moved back until the first one is the newest sample
        const first = Math.max(0, whole - 1);
        const t = delay - first;
        const p = this.position - first;
        const x0 = this.buffer[p & this.mask];
        const x1 = this.buffer[(p - 1) & this.mask];
        const x2 = this.buffer[(p - 2) & this.mask];
        const x3 = this.buffer[(p - 3) & this.mask];
        return (
            (-x0 * (t - 1) * (t - 2) * (t - 3)) / 6 +
            (x1 * t * (t - 2) * (t - 3)) / 2 -
            (x2 * t * (t - 1) * (t - 3)) / 2 +
            (x3 * t * (t - 1) * (t - 2)) / 6
        );
    }

    /**
     * A read between whole 32 kHz samples, linear like the hardware's, each of the two points band-limited at the
     * host rate. At 32 kHz it is the hardware's read.
     * @param delay The delay in 32 kHz samples.
     * @param step One 32 kHz sample in host samples.
     * @param offset Host samples taken off both points (1 for a read before the write).
     */
    public readGrid(delay: number, step: number, offset: number) {
        const whole = Math.floor(delay);
        const fraction = delay - whole;
        const a = this.readSinc(Math.max(0, whole * step - offset));
        if (fraction === 0) return a;
        const b = this.readSinc(Math.max(0, (whole + 1) * step - offset));
        return a + (b - a) * fraction;
    }

    public clear() {
        this.buffer.fill(0);
    }
}
