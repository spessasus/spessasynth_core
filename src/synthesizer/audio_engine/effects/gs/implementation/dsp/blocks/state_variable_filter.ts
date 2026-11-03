import { Biquad } from "./biquad";

/**
 * The rate the hardware runs its filters at.
 */
const HARDWARE_RATE = 32_000;

/**
 * The resonant filters of the amp simulators. On the hardware they are Chamberlin state variable filters at
 * 32 kHz, which at 4 kHz roll off far less than their nominal analog shape. This is that 32 kHz filter turned
 * back into its analog prototype (the inverse bilinear transform) and designed again at the host rate, so it
 * sounds the same at any rate and is exact at 32 kHz.
 * @internal
 */
export class StateVariableFilter extends Biquad {
    /**
     * @param frequency The corner in Hz.
     * @param q The resonance.
     */
    public setHighPass(frequency: number, q: number) {
        const { w, resonance, s2 } = this.prototype(frequency, q);
        // The Chamberlin high pass is (1 - z^-1)^2 over its poles, 4 s^2 on the analog side
        this.setAnalog(4 / s2, 0, 0, 1, w / resonance, w * w);
    }

    /**
     * @param frequency The corner in Hz.
     * @param q The resonance.
     */
    public setLowPass(frequency: number, q: number) {
        const { w, resonance } = this.prototype(frequency, q);
        // The Chamberlin low pass is k^2 z^-1 over its poles: unity at DC and a real zero pair
        // It sits at +-1 on the analog side (8 kHz on the prewarped axis at 32 kHz)
        const zero = this.prewarp(HARDWARE_RATE / 4);
        this.setAnalog(
            -(w * w) / (zero * zero),
            0,
            w * w,
            1,
            w / resonance,
            w * w
        );
    }

    /**
     * The poles of the 32 kHz Chamberlin filter on the analog side, moved to the host rate's prewarped axis.
     * @param frequency The corner in Hz.
     * @param q The resonance.
     */
    private prototype(frequency: number, q: number) {
        const k = 2 * Math.sin((Math.PI * frequency) / HARDWARE_RATE);
        const dk = k / q;
        // At 32 kHz the denominator is s2 s^2 + 2 dk s + k^2
        const s2 = 4 - 2 * dk - k * k;
        const w32 = k / Math.sqrt(s2);
        return {
            w: this.prewarp((HARDWARE_RATE / Math.PI) * Math.atan(w32)),
            resonance: (k * Math.sqrt(s2)) / (2 * dk),
            s2
        };
    }
}
