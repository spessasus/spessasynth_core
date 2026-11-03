import { FLUSH, prewarp } from "./first_order_filter";

/**
 * A second order section, designed with the bilinear transform. Each pole and zero pair is prewarped at its own
 * frequency, so a design taken from the 32 kHz hardware comes back exactly at 32 kHz.
 * @internal
 */
export class Biquad {
    protected readonly sampleRate: number;
    private b0 = 1;
    private b1 = 0;
    private b2 = 0;
    private a1 = 0;
    private a2 = 0;
    private s1 = 0;
    private s2 = 0;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
    }

    /**
     * Passes the signal through unchanged.
     */
    public setOff() {
        this.b0 = 1;
        this.b1 = this.b2 = this.a1 = this.a2 = 0;
    }

    /**
     * A peaking band. A cut is the exact inverse of the boost of the same size, so the Q belongs to the boost side.
     * @param frequency The center in Hz.
     * @param q The Q of the boost (on the prewarped axis).
     * @param gainDb The gain at the center in dB.
     */
    public setPeaking(frequency: number, q: number, gainDb: number) {
        const g = 10 ** (gainDb / 20);
        if (g >= 1) {
            this.setPoleZero(frequency, q, frequency, q / g);
        } else {
            this.setPoleZero(frequency, g * q, frequency, q);
        }
    }

    /**
     * `H(s) = (s^2 + s wz / qz + wz^2) / (s^2 + s wp / qp + wp^2)`, unity at Nyquist.
     * @param pole The frequency of the poles in Hz.
     * @param poleQ Their Q.
     * @param zero The frequency of the zeros in Hz.
     * @param zeroQ Their Q.
     */
    public setPoleZero(
        pole: number,
        poleQ: number,
        zero: number,
        zeroQ: number
    ) {
        const wp = this.prewarp(pole);
        const wz = this.prewarp(zero);
        this.setAnalog(1, wz / zeroQ, wz * wz, 1, wp / poleQ, wp * wp);
    }

    /**
     * Sets `H(s) = (n2 s^2 + n1 s + n0) / (d2 s^2 + d1 s + d0)` with `s` normalized to `2 fs` (prewarp the
     * frequencies with `prewarp`).
     */
    public setAnalog(
        n2: number,
        n1: number,
        n0: number,
        d2: number,
        d1: number,
        d0: number
    ) {
        const a0 = d2 + d1 + d0;
        this.b0 = (n2 + n1 + n0) / a0;
        this.b1 = (2 * (n0 - n2)) / a0;
        this.b2 = (n2 - n1 + n0) / a0;
        this.a1 = (2 * (d0 - d2)) / a0;
        this.a2 = (d2 - d1 + d0) / a0;
    }

    public process(x: number) {
        // Transposed direct form II
        const y = this.b0 * x + this.s1;
        const s1 = this.b1 * x - this.a1 * y + this.s2;
        const s2 = this.b2 * x - this.a2 * y;
        // A decaying state gets stuck among the subnormals, which are slow
        this.s1 = Math.abs(s1) < FLUSH ? 0 : s1;
        this.s2 = Math.abs(s2) < FLUSH ? 0 : s2;
        return y;
    }

    public clear() {
        this.s1 = 0;
        this.s2 = 0;
    }

    /**
     * The prewarped analog frequency, normalized to `2 fs`.
     * @param frequency The frequency in Hz.
     */
    public prewarp(frequency: number) {
        return prewarp(frequency, this.sampleRate);
    }
}
