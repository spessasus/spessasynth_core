/**
 * The corner of the DC blocking high pass that the delays, reverbs, drives and Lo-Fi types put on their input.
 * @internal
 */
export const DC_BLOCKER_HZ = 19.88;

/**
 * Recursive states under this are flushed to zero (-600 dB, far under any signal). A one-pole decay otherwise
 * ends on a subnormal fixed point, and subnormal arithmetic is many times slower.
 * @internal
 */
export const FLUSH = 1e-30;

/**
 * The prewarped analog frequency of a corner, normalized to `2 fs` (so the bilinear transform is
 * `s = (1 - z^-1) / (1 + z^-1)`). Corners above 0.49 fs are held there.
 * @param frequency The corner in Hz.
 * @param sampleRate The sample rate.
 * @internal
 */
export function prewarp(frequency: number, sampleRate: number) {
    return Math.tan(
        (Math.PI * Math.min(frequency, sampleRate * 0.49)) / sampleRate
    );
}

/**
 * The corner of the hardware's one-pole low pass `(1 - B) x + B y[n-1]` at 32 kHz (-3 dB, the inverse of
 * `FirstOrderFilter.setDamp`).
 * @param pole B.
 * @internal
 */
export function dampCorner(pole: number) {
    const k = (1 + pole * pole) / (2 * pole);
    return (Math.acos(2 - k) * 32_000) / (2 * Math.PI);
}

/**
 * A first order section, `y = b0 x + b1 x[n-1] + a1 y[n-1]`, designed with the bilinear transform.
 * The tone filters, the shelves and the DC blockers of the Sound Canvas are all this section.
 * @internal
 */
export class FirstOrderFilter {
    private readonly sampleRate: number;
    private b0 = 1;
    private b1 = 0;
    private a1 = 0;
    private x1 = 0;
    private y1 = 0;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
    }

    /**
     * Passes the signal through unchanged.
     */
    public setOff() {
        this.set(1, 0, 0);
    }

    /**
     * A low pass.
     * @param frequency The -3 dB corner in Hz.
     * @param gain The gain at DC.
     */
    public setLowPass(frequency: number, gain = 1) {
        const t = prewarp(frequency, this.sampleRate);
        const b = (gain * t) / (1 + t);
        this.set(b, b, (1 - t) / (1 + t));
    }

    /**
     * A high pass.
     * @param frequency The -3 dB corner in Hz.
     * @param gain The gain at Nyquist.
     */
    public setHighPass(frequency: number, gain = 1) {
        const t = prewarp(frequency, this.sampleRate);
        const b = gain / (1 + t);
        this.set(b, -b, (1 - t) / (1 + t));
    }

    /**
     * The choruses' tone filters. On the hardware they are bilinear one-poles at 32 kHz with byte coefficients: the
     * pole is C = round(128 c) and the gain A = round(64 (1 -+ c)). That rounding moves the corner slightly and the
     * pass band by up to 0.6 dB, both kept.
     * @param highPass A high pass instead of a low pass.
     * @param frequency The cutoff in Hz (the Cut column).
     * @param gain A gain on top.
     */
    public setTone(highPass: boolean, frequency: number, gain = 1) {
        const k = Math.tan((Math.PI * frequency) / 32_000);
        const c = (1 - k) / (1 + k);
        const pole = Math.round(128 * c);
        const corner =
            (Math.atan((128 - pole) / (128 + pole)) * 32_000) / Math.PI;
        if (highPass) {
            this.setHighPass(
                corner,
                (gain * 2 * Math.round(64 * (1 + c))) / (128 + pole)
            );
        } else {
            this.setLowPass(
                corner,
                (gain * 2 * Math.round(64 * (1 - c))) / (128 - pole)
            );
        }
    }

    /**
     * The delays' HF damp. On the hardware it is a one-pole without a zero at 32 kHz, `y = (1 - B) x + B y[n-1]`,
     * unity at DC and -3 dB at the frequency. This is its inverse bilinear prototype (the pole plus a zero at
     * 64000 rad/s, where the 32 kHz Nyquist maps to) at the host rate, exact at 32 kHz. A plain one-pole at
     * another rate would miss the hardware's flattening near 16 kHz by up to 1.3 dB.
     * @param frequency The -3 dB corner in Hz.
     */
    public setDamp(frequency: number) {
        const k = 2 - Math.cos((2 * Math.PI * frequency) / 32_000);
        const b = k - Math.sqrt(k * k - 1);
        // Normalized to 2 x 32 kHz the prototype is (1 - B)(1 + s) / ((1 - B) + (1 + B) s)
        const scale = 32_000 / this.sampleRate;
        const gain = (1 - b) / (1 + b);
        this.setAnalog(gain, scale, gain * scale);
    }

    /**
     * A plain gain.
     * @param gain The gain.
     */
    public setGain(gain: number) {
        this.set(gain, 0, 0);
    }

    /**
     * A low shelf. One corner stays at the given frequency, the gain moves the other one: a boost puts the pole
     * at `frequency / gain`, a cut puts the zero at `frequency * gain`, so a cut is the exact inverse of a boost.
     * @param frequency The fixed corner in Hz.
     * @param gainDb The gain below the corner in dB.
     */
    public setLowShelf(frequency: number, gainDb: number) {
        const w = prewarp(frequency, this.sampleRate);
        const g = 10 ** (gainDb / 20);
        if (g >= 1) {
            this.setAnalog(1, w, w / g);
        } else {
            this.setAnalog(1, w * g, w);
        }
    }

    /**
     * A high shelf, the mirror image of the low shelf: a boost puts the pole at `frequency * gain`, a cut puts the
     * zero at `frequency / gain`.
     * @param frequency The fixed corner in Hz.
     * @param gainDb The gain above the corner in dB.
     */
    public setHighShelf(frequency: number, gainDb: number) {
        const w = prewarp(frequency, this.sampleRate);
        const g = 10 ** (gainDb / 20);
        if (g >= 1) {
            this.setAnalog(g, w, w * g);
        } else {
            this.setAnalog(g, w / g, w);
        }
    }

    /**
     * A general section `H(s) = k (s + zero) / (s + pole)`, for the presets that are neither shelves nor plain
     * passes. Both corners are prewarped, a negative zero is a zero in the right half plane.
     * @param zero The zero in Hz.
     * @param pole The pole in Hz.
     * @param k The gain at Nyquist.
     */
    public setPoleZero(zero: number, pole: number, k: number) {
        this.setAnalog(
            k,
            prewarp(zero, this.sampleRate),
            prewarp(pole, this.sampleRate)
        );
    }

    public process(x: number) {
        let y = this.b0 * x + this.b1 * this.x1 + this.a1 * this.y1;
        // A decaying state gets stuck among the subnormals, which are slow
        if (Math.abs(y) < FLUSH) y = 0;
        this.x1 = x;
        this.y1 = y;
        return y;
    }

    public clear() {
        this.x1 = 0;
        this.y1 = 0;
    }

    /**
     * Sets `H(s) = k (s + zero) / (s + pole)` (normalized frequencies).
     * @param k The gain at Nyquist.
     * @param zero The zero.
     * @param pole The pole.
     */
    private setAnalog(k: number, zero: number, pole: number) {
        this.set(
            (k * (1 + zero)) / (1 + pole),
            (k * (zero - 1)) / (1 + pole),
            (1 - pole) / (1 + pole)
        );
    }

    private set(b0: number, b1: number, a1: number) {
        this.b0 = b0;
        this.b1 = b1;
        this.a1 = a1;
    }
}
