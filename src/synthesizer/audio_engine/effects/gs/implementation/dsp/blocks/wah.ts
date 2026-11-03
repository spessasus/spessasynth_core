import { Biquad } from "./biquad";
import { FirstOrderFilter } from "./first_order_filter";
import { LFO } from "./lfo";

/**
 * The side chain high passes: the hardware's 32 kHz one-poles (pole 53/128, gain 91/128), a corner of 4 kHz.
 */
const SIDE_CHAIN_HZ =
    (32_000 / Math.PI) * Math.atan((1 - 53 / 128) / (1 + 53 / 128));
const SIDE_CHAIN_GAIN = (2 * 91) / 128 / (1 + 53 / 128);

/**
 * The follower's attack per 32 kHz sample (+0.31 dB) and the step that lets it start from silence.
 */
const ATTACK = 1.036_621_093_75;
const ATTACK_SEED = 2 ** -22;

/**
 * The follower's release per 32 kHz sample (a 64 ms time constant).
 */
const RELEASE = 1 - 1 / 2048;

/**
 * The cutoff smoother's pole per 32 kHz sample (8 ms).
 */
const SMOOTHER = 255 / 256;

/**
 * The wah: a resonant low pass or band pass whose cutoff follows the Manual, a triangle LFO and an envelope
 * follower on the input.
 *
 * On the hardware it is a Chamberlin state variable filter at 32 kHz, `B += F (s1 (u - q B) - L)`, `L += F B`,
 * fed with `u = (x + x[n-1]) / 4`. The low pass has `s1 = 1` and the Peak sets `q = 1/Q`, independent of the cutoff.
 * The band pass has `q = 1` and the Peak sets `s1 = k clamp(F, 0.1, 0.4)`, so its Q is tied to the cutoff (11 at
 * 730 Hz, 2.4 at 3.7 kHz for Peak 64) while its peak gain stays the same. Here that 32 kHz filter is turned into its
 * analog prototype (the inverse bilinear transform) and designed again at the host rate around its pole frequency.
 *
 * The cutoff control `w` is the Manual plus or minus the LFO and the envelope, then `F` runs through an 8 ms
 * smoother. The DSP saturates its registers to [-1, 1), which keeps `w` within 0 to 1 (a 250 Hz floor and a
 * ceiling near 4.2 kHz) and the envelope under 1. The SC-88Pro shows the floor, the ceiling and the band pass clamp.
 * @internal
 */
export class Wah {
    private readonly filter: Biquad;
    private readonly lfo: LFO;
    private readonly sideChain1: FirstOrderFilter;
    private readonly sideChain2: FirstOrderFilter;
    /**
     * 32 kHz over the host rate.
     */
    private readonly scale: number;
    private readonly attack: number;
    private readonly attackSeed: number;
    private readonly release: number;
    private readonly smoothing: number;
    private bandPass = false;
    private peak = 0;
    private peakValue = 0;
    private manual = 0;
    private sensitivity = 0;
    private depth = 0;
    private up = true;
    private envelopeOn = true;
    private envelope = 0;
    private coefficient = 0;
    private lastCoefficient = -1;
    private lastDamping = -1;

    public constructor(sampleRate: number) {
        this.filter = new Biquad(sampleRate);
        this.lfo = new LFO(sampleRate);
        this.sideChain1 = new FirstOrderFilter(sampleRate);
        this.sideChain1.setHighPass(SIDE_CHAIN_HZ, SIDE_CHAIN_GAIN);
        this.sideChain2 = new FirstOrderFilter(sampleRate);
        this.sideChain2.setHighPass(SIDE_CHAIN_HZ, SIDE_CHAIN_GAIN);
        this.scale = 32_000 / sampleRate;
        // The per sample factors of the 32 kHz hardware, moved to the host rate
        this.attack = ATTACK ** this.scale;
        this.attackSeed = (ATTACK_SEED * (this.attack - 1)) / (ATTACK - 1);
        this.release = RELEASE ** this.scale;
        this.smoothing = 1 - SMOOTHER ** this.scale;
    }

    /**
     * @param bandPass The band pass instead of the low pass.
     */
    public setFilterType(bandPass: boolean) {
        this.bandPass = bandPass;
        this.updatePeak();
    }

    /**
     * @param value The Peak parameter (0-127).
     */
    public setPeak(value: number) {
        this.peakValue = value;
        this.updatePeak();
    }

    /**
     * @param manual The Manual as a gain (the level law), 0 to 127/128.
     */
    public setManual(manual: number) {
        this.manual = manual;
    }

    /**
     * @param sensitivity The Sens as a gain (the level law), 0 to 127/128.
     */
    public setSensitivity(sensitivity: number) {
        // The Sens register has the wide format, the level over 32 instead of over 128
        this.sensitivity = 4 * sensitivity;
    }

    /**
     * @param hz The LFO rate.
     */
    public setRate(hz: number) {
        this.lfo.setRate(hz);
    }

    /**
     * @param depth The LFO's share of the cutoff control (0 to 0.78).
     */
    public setDepth(depth: number) {
        this.depth = depth;
    }

    /**
     * @param up The LFO and the envelope raise the cutoff (Up) instead of lowering it (Down).
     */
    public setPolarity(up: boolean) {
        this.up = up;
    }

    /**
     * @param on The envelope follower (off in the multis without a Sens parameter).
     */
    public setEnvelope(on: boolean) {
        this.envelopeOn = on;
    }

    public process(x: number) {
        let y = 0;
        if (this.envelopeOn) {
            // A 4 kHz second order high pass, x 127/32 x Sens, rectified
            const v = Math.abs(
                this.sideChain2.process(this.sideChain1.process(x)) *
                    (127 / 32) *
                    this.sensitivity
            );
            // The follower jumps up while the input is within 20 dB of it, so it rides at 10x the peaks
            let e = this.envelope;
            e =
                v >= 0.1 * e
                    ? e * this.attack + this.attackSeed
                    : e * this.release;
            this.envelope = e = Math.min(e, 1);
            y =
                e < 0.1
                    ? 4.960_937_5 * e
                    : 0.555_541_992_187_5 * e + 0.444_458_007_812_5;
        }
        const swing = this.depth * Math.abs(this.lfo.process()) + y;
        let w = this.up
            ? this.manual - 0.1 + (127 / 128) * swing
            : this.manual + 0.1 - swing;
        w = Math.max(0, Math.min(w, 1));
        // F = 2 sin(pi fc / 32000): fc = 250 + 1500 w below about 1 kHz, 6000 w - 2000 above
        const target =
            (127 / 128) * w < 0.5
                ? Math.PI * ((3 * w) / 32 + 1 / 64)
                : Math.PI * ((3 * w) / 8 - 1 / 8);
        const f = (this.coefficient +=
            this.smoothing * (target - this.coefficient));
        // The band pass damps (and scales its input) by k clamp(F, 0.1, 0.4)
        let s1 = this.bandPass
            ? this.peak * Math.max(0.1, Math.min(0.4, f))
            : 1;
        s1 = Math.min(s1, 1.95, 2 - f);
        if (f !== this.lastCoefficient || s1 !== this.lastDamping) {
            this.design(f, s1);
        }
        return this.filter.process(x);
    }

    public clear() {
        this.filter.clear();
        this.lfo.clear();
        this.sideChain1.clear();
        this.sideChain2.clear();
        this.envelope = 0;
        this.coefficient = 0;
        this.lastCoefficient = -1;
    }

    /**
     * The Peak's law depends on the filter type.
     */
    private updatePeak() {
        // Low pass: 1/Q from 1 to 0.04. Band pass: the damping's k from 4 to 0.1
        const value = this.peakValue;
        this.peak = this.bandPass
            ? 4 * 40 ** (-value / 127)
            : 25 ** (-value / 127);
        this.lastCoefficient = -1;
    }

    /**
     * Designs the filter from the 32 kHz Chamberlin coefficients.
     * @param f The frequency coefficient F.
     * @param s1 The input gain (and the band pass damping).
     */
    private design(f: number, s1: number) {
        this.lastCoefficient = f;
        this.lastDamping = s1;
        const fd = f * s1 * (this.bandPass ? 1 : this.peak);
        // The 32 kHz poles on the analog side (s normalized to 64000 rad/s): s2 s^2 + 2 F d s + F^2
        const s2 = 4 - 2 * fd - f * f;
        const w32 = f / Math.sqrt(s2);
        if (this.bandPass) {
            // F s1 s over the poles, out at 127/32: a peak gain of 127/64 at any Q
            // The -3 dB edges keep their place in Hz, so a wide band near the top does not spread at higher rates
            const width = (2 * fd) / s2;
            let low = Math.sqrt(w32 * w32 + 0.25 * width * width) - 0.5 * width;
            let high = low + width;
            if (this.scale !== 1) {
                low = this.filter.prewarp((32_000 / Math.PI) * Math.atan(low));
                high = this.filter.prewarp(
                    (32_000 / Math.PI) * Math.atan(high)
                );
            }
            const band = high - low;
            this.filter.setAnalog(0, (127 / 64) * band, 0, 1, band, low * high);
        } else {
            // F^2 (1 + s) / 2 over the poles (the zero is the input's (x + x[n-1]) / 4), out at 127/128
            // The pole frequency is prewarped for the host rate, which scales s by l
            const l =
                this.scale === 1
                    ? 1
                    : w32 /
                      this.filter.prewarp((32_000 / Math.PI) * Math.atan(w32));
            const n = (127 / 128) * 0.5 * f * f;
            this.filter.setAnalog(0, n * l, n, s2 * l * l, 2 * fd * l, f * f);
        }
    }
}
