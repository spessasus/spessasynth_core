import { absCentsToHz, cbAttenuationToGain } from "../unit_converter";

/**
 * Lowpass_filter.ts
 * purpose: applies a low pass filter to a voice
 * note to self: a lot of tricks and come from fluidsynth.
 * They are the real smart guys.
 * Shoutout to them!
 * Give their repo a star over at:
 * https://github.com/FluidSynth/fluidsynth
 */

// Latest test: 06-12-2025 for the 9600 cent cc74 change (XG accurate)
// Lowered from 0.1 to 0.03
export const FILTER_SMOOTHING_FACTOR = 0.03;

// Represents a single cached coefficient.
interface CachedCoefficient {
    // Filter coefficient 1.
    a0: number;
    // Filter coefficient 2.
    a1: number;
    // Filter coefficient 3.
    a2: number;
    // Filter coefficient 4.
    a3: number;
    // Filter coefficient 5.
    a4: number;
}

export class LowpassFilter {
    /**
     * For smoothing the filter cutoff frequency.
     */
    public static smoothingConstant = 1;
    /**
     * Cached coefficient calculations.
     * stored as cachedCoefficients[resonanceCb + currentInitialFc * 961].
     */
    private static cachedCoefficients = new Map<number, CachedCoefficient>();
    /**
     * Resonance in centibels.
     */
    public resonanceCb = 0;
    /**
     * Current cutoff frequency in absolute cents.
     */
    public currentInitialFc = 13_500;
    /**
     * Filter coefficient 1.
     */
    public a0 = 0;
    /**
     * Filter coefficient 2.
     */
    public a1 = 0;
    /**
     * Filter coefficient 3.
     */
    public a2 = 0;
    /**
     * Filter coefficient 4.
     */
    public a3 = 0;
    /**
     * Filter coefficient 5.
     */
    public a4 = 0;
    /**
     * Input history 1.
     */
    public x1 = 0;
    /**
     * Input history 2.
     */
    public x2 = 0;
    /**
     * Output history 1.
     */
    public y1 = 0;
    /**
     * Output history 2.
     */
    public y2 = 0;
    /**
     * For tracking the last cutoff frequency in the apply method, absolute cents.
     * Set to infinity to force recalculation.
     */
    public lastTargetCutoff = Infinity;
    /**
     * Used for tracking if the filter has been initialized.
     */
    public initialized = false;
    /**
     * Filter's sample rate in Hz.
     */
    private readonly sampleRate;
    /**
     * Maximum cutoff frequency in Hz.
     * This is used to prevent aliasing and ensure the filter operates within the valid frequency range.
     */
    private readonly maxCutoff: number;

    /**
     * Initializes a new instance of the filter.
     * @param sampleRate the sample rate of the audio engine in Hz.
     */
    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.maxCutoff = sampleRate * 0.45;
    }

    public static initCache(sampleRate: number) {
        LowpassFilter.smoothingConstant =
            FILTER_SMOOTHING_FACTOR * (44_100 / sampleRate);
        // Precompute all the cutoffs for 0q (most common)
        const dummy = new LowpassFilter(sampleRate);
        dummy.resonanceCb = 0;
        // Sf spec section 8.1.3: initialFilterFc ranges from 1500 to 13,500 cents
        for (let i = 1500; i < 13_500; i++) {
            dummy.currentInitialFc = i;
            dummy.calculateCoefficients(i);
        }
    }

    public init() {
        this.lastTargetCutoff = Infinity;
        this.resonanceCb = 0;
        this.currentInitialFc = 13_500;
        this.a0 = 0;
        this.a1 = 0;
        this.a2 = 0;
        this.a3 = 0;
        this.a4 = 0;
        this.x1 = 0;
        this.x2 = 0;
        this.y1 = 0;
        this.y2 = 0;
        this.initialized = false;
    }

    /**
     * Calculates the filter coefficients based on the current resonance and cutoff frequency and caches them.
     * @param cutoffCents The cutoff frequency in cents.
     */
    public calculateCoefficients(cutoffCents: number) {
        cutoffCents = cutoffCents | 0; // Math.floor
        const qCb = this.resonanceCb;
        // Check if these coefficients were already cached
        const cached = LowpassFilter.cachedCoefficients.get(
            qCb + cutoffCents * 961
        );
        if (cached !== undefined) {
            this.a0 = cached.a0;
            this.a1 = cached.a1;
            this.a2 = cached.a2;
            this.a3 = cached.a3;
            this.a4 = cached.a4;
            return;
        }
        let cutoffHz = absCentsToHz(cutoffCents);

        // Fix cutoff on low sample rates
        cutoffHz = Math.min(cutoffHz, this.maxCutoff);

        // The coefficient calculation code was originally ported from meltysynth by sinshu.
        // Turn resonance to gain, -3.01 so it gives a non-resonant peak
        // -1 because it's attenuation, and we don't want attenuation
        const resonanceGain = cbAttenuationToGain(-(qCb - 3.01));

        // The sf spec asks for a reduction in gain based on the Q value.
        // Note that we calculate it again,
        // Without the 3.01-peak offset as it only applies to the coefficients, not the gain.
        const qGain = 1 / Math.sqrt(cbAttenuationToGain(-qCb));

        // Note: no sin or cos tables are used here as the coefficients are cached
        const w = (2 * Math.PI * cutoffHz) / this.sampleRate;
        const cosw = Math.cos(w);
        const alpha = Math.sin(w) / (2 * resonanceGain);

        const b1 = (1 - cosw) * qGain;
        const b0 = b1 / 2;
        const b2 = b0;
        const a0 = 1 + alpha;
        const a1 = -2 * cosw;
        const a2 = 1 - alpha;

        const toCache: CachedCoefficient = {
            a0: b0 / a0,
            a1: b1 / a0,
            a2: b2 / a0,
            a3: a1 / a0,
            a4: a2 / a0
        };
        this.a0 = toCache.a0;
        this.a1 = toCache.a1;
        this.a2 = toCache.a2;
        this.a3 = toCache.a3;
        this.a4 = toCache.a4;

        // Cache the coefficients
        LowpassFilter.cachedCoefficients.set(qCb + cutoffCents * 961, toCache);
    }
}
