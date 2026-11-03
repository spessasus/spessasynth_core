import { DelayLine } from "./delay_line";

/**
 * One direction of the 3D model: the near ear `N = a x + b2 N[62.5 us] + b4 N[125 us]` and the far ear
 * `F = f F[31.25 us] + g N[d1] + h N[d2]`, the near signal delayed by two taps through a one-pole (the time and the
 * head shadow between the ears). The delays are the hardware's 32 kHz samples in seconds, `d1` and `d2` in 32 kHz
 * samples.
 * @internal
 */
export interface HRTFSet {
    a: number;
    b2: number;
    b4: number;
    f: number;
    g: number;
    d1: number;
    h: number;
    d2: number;
}

/**
 * The near and far ear filters of the 3D types, between two direction sets.
 *
 * Both sets run on one shared history: the near coefficients mix directly (their delays are the same in every set),
 * the far ear is the weighted sum of both sets' taps through the weighted one-pole, as on the hardware. The delays
 * keep their length in seconds, read with a Lagrange interpolator where they fall between samples, so the response
 * is the 32 kHz one in Hz (whole at 96 kHz).
 * @internal
 */
export class HRTFPair {
    public near = 0;
    public far = 0;
    private readonly nearLine: DelayLine;
    private readonly farLine: DelayLine;
    /**
     * One 32 kHz sample in host samples.
     */
    private readonly step: number;
    private setA: HRTFSet;
    private setB: HRTFSet;
    private weight = 1;

    /**
     * @param sampleRate The sample rate.
     * @param set The starting set.
     */
    public constructor(sampleRate: number, set: HRTFSet) {
        this.step = sampleRate / 32_000;
        // The far taps reach 29 samples back, plus the interpolator's points
        this.nearLine = new DelayLine(Math.ceil(32 * this.step) + 4);
        this.farLine = new DelayLine(Math.ceil(this.step) + 4);
        this.setA = set;
        this.setB = set;
    }

    /**
     * @param a The set at weight 1.
     * @param b The set at weight 0.
     * @param weight The share of set A.
     */
    public setSets(a: HRTFSet, b: HRTFSet, weight: number) {
        this.setA = a;
        this.setB = b;
        this.weight = weight;
    }

    public process(x: number) {
        const { nearLine, farLine, step, setA: a, setB: b, weight: w } = this;
        const v = 1 - w;
        // Reads of earlier samples (before this sample's writes)
        const n2 = nearLine.readLagrange(2 * step - 1);
        const n4 = nearLine.readLagrange(4 * step - 1);
        const f1 = farLine.readLagrange(step - 1);
        const near =
            (w * a.a + v * b.a) * x +
            (w * a.b2 + v * b.b2) * n2 +
            (w * a.b4 + v * b.b4) * n4;
        nearLine.write(near);
        const far =
            (w * a.f + v * b.f) * f1 +
            w * (a.g * this.tap(a.d1) + a.h * this.tap(a.d2)) +
            v * (b.g * this.tap(b.d1) + b.h * this.tap(b.d2));
        farLine.write(far);
        this.near = near;
        this.far = far;
    }

    public clear() {
        this.nearLine.clear();
        this.farLine.clear();
        this.near = this.far = 0;
    }

    /**
     * The near signal some 32 kHz samples back (0 is this sample's).
     * @param samples The delay in 32 kHz samples.
     */
    private tap(samples: number) {
        return this.nearLine.readLagrange(samples * this.step);
    }
}
