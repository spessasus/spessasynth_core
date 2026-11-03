import { Biquad } from "./biquad";
import { FirstOrderFilter } from "./first_order_filter";

/**
 * One vowel: two formants, each a 32 kHz Chamberlin state variable filter given by its frequency coefficient
 * `F = 2 sin(pi f / 32000)` and damping `q` (about 1/Q), with a tap on its low pass (formant 1) or high pass
 * (formant 2) and one on its band pass.
 */
interface Vowel {
    f1: number;
    q1: number;
    low1: number;
    band1: number;
    f2: number;
    q2: number;
    high2: number;
    band2: number;
}

/**
 * The vowels a, i, u, e, o as the hardware's coefficient words. Formant 1 and 2 peak at about 1028 and 1837 Hz (a),
 * 288 and 3470 Hz (i), 157 and 918 Hz (u), 550 and 2428 Hz (e), 550 and 525 Hz (o).
 */
const VOWELS: Vowel[] = [
    [0x19_a2, 0x0f_80, 0x18_00, 0x3f_80, 0x0b_52, 0x13_00, 0x09_00, 0x18_00],
    [0x07_3c, 0x1c_00, 0x18_00, 0x20_00, 0x14_90, 0x1b_00, 0x0f_80, 0x1e_80],
    [0x03_f2, 0x10_00, 0x30_00, 0x02_d0, 0x05_c0, 0x07_00, 0x20_00, 0x30_00],
    [0x0d_cf, 0x1e_00, 0x18_00, 0x20_00, 0x0e_be, 0x17_00, 0x16_00, 0x21_80],
    [0x0d_cf, 0x15_80, 0x2a_80, 0x1e_00, 0x03_49, 0x09_80, 0x16_00, 0x1a_80]
].map(([f1, q1, low1, band1, f2, q2, high2, band2]) => ({
    f1: f1 / 32_768,
    q1: q1 / 32_768,
    low1: low1 / 8192,
    band1: band1 / 8192,
    f2: f2 / 8192,
    q2: q2 / 32_768,
    high2: high2 / 8192,
    band2: band2 / 8192
}));

/**
 * The gain of each formant's taps.
 */
const TAP_GAIN = 1.25;

/**
 * One bank: the two formants of a vowel, summed.
 */
class FormantBank {
    private readonly formant1: Biquad;
    private readonly formant2: Biquad;
    /**
     * Formant 2's share of the input's `(x + x[n-1]) / 2` that its high pass does not cancel.
     */
    private readonly average: FirstOrderFilter;
    /**
     * 32 kHz over the host rate.
     */
    private readonly scale: number;

    public constructor(sampleRate: number) {
        this.formant1 = new Biquad(sampleRate);
        this.formant2 = new Biquad(sampleRate);
        this.average = new FirstOrderFilter(sampleRate);
        this.average.setLowPass(8000);
        this.scale = 32_000 / sampleRate;
    }

    /**
     * @param vowel The vowel (0-4).
     */
    public load(vowel: number) {
        const v = VOWELS[vowel];
        // The Chamberlin filter on its input (x + x[n-1]) / 2, on the analog side (s normalized to 64000 rad/s)
        // Poles s2 s^2 + 2 F q s + F^2, over them the low pass q F^2 (1 - s), the band pass 2 q F s
        // And the high pass 4 q s^2 / (1 + s)
        {
            const { f, s2, l } = this.prototype(v.f1, v.q1);
            const k = TAP_GAIN * v.q1 * f;
            this.formant1.setAnalog(
                0,
                k * (2 * v.band1 - v.low1 * f) * l,
                k * v.low1 * f,
                s2 * l * l,
                2 * f * v.q1 * l,
                f * f
            );
        }
        {
            const { f, s2, l } = this.prototype(v.f2, v.q2);
            const k = 2 * TAP_GAIN * v.q2;
            // 1 / (1 + s) is the average filter
            this.formant2.setAnalog(
                k * (2 * v.high2 + f * v.band2) * l * l,
                k * f * v.band2 * l,
                0,
                s2 * l * l,
                2 * f * v.q2 * l,
                f * f
            );
        }
    }

    public process(x: number) {
        return (
            this.formant1.process(x) +
            this.average.process(this.formant2.process(x))
        );
    }

    public clear() {
        this.formant1.clear();
        this.formant2.clear();
        this.average.clear();
    }

    /**
     * The poles of a formant and the scale of s that keeps their frequency at the host rate.
     * @param f The frequency coefficient.
     * @param q The damping.
     */
    private prototype(f: number, q: number) {
        const s2 = 4 - 2 * f * q - f * f;
        const w32 = f / Math.sqrt(s2);
        const l =
            this.scale === 1
                ? 1
                : w32 /
                  this.formant1.prewarp((32_000 / Math.PI) * Math.atan(w32));
        return { f, s2, l };
    }
}

/**
 * The Humanizer's vowel filter: two banks of two formants. A new vowel goes into the idle bank and a ramp
 * crossfades to it. The output is `(1 + r) A + r B` with r from 0 (bank A) to -1 (bank B), so a vowel in bank B
 * comes out inverted, and halfway the banks subtract. The SC-88Pro does the same.
 * @internal
 */
export class FormantFilter {
    private readonly bankA: FormantBank;
    private readonly bankB: FormantBank;
    private readonly sampleRate: number;
    private vowel = 0;
    /**
     * The bank the crossfade moves to (false for A).
     */
    private onB = false;
    private target = 0;
    private fade = 0;
    private rate = 0;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.bankA = new FormantBank(sampleRate);
        this.bankB = new FormantBank(sampleRate);
        this.clear();
    }

    /**
     * Loads a vowel into the idle bank and crossfades to it, if it is not the current one.
     * @param vowel The vowel (0-4: a, i, u, e, o).
     */
    public setVowel(vowel: number) {
        if (vowel === this.vowel) return;
        this.vowel = vowel;
        this.onB = !this.onB;
        (this.onB ? this.bankB : this.bankA).load(vowel);
        this.target = this.onB ? -1 : 0;
    }

    /**
     * @param seconds The crossfade's time constant.
     */
    public setAccel(seconds: number) {
        this.rate =
            1 - (1 - 1 / (32_000 * seconds)) ** (32_000 / this.sampleRate);
    }

    public process(x: number) {
        const r = (this.fade += this.rate * (this.target - this.fade));
        return (1 + r) * this.bankA.process(x) + r * this.bankB.process(x);
    }

    /**
     * Clears the filters and starts on vowel a in bank A (bank B holds i, as after a type select).
     */
    public clear() {
        this.bankA.clear();
        this.bankB.clear();
        this.bankA.load(0);
        this.bankB.load(1);
        this.vowel = 0;
        this.onB = false;
        this.target = 0;
        this.fade = 0;
    }
}
