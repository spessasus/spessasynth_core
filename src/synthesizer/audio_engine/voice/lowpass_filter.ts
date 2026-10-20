import { absCentsToHz, cbAttenuationToGain } from "./unit_converter";

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

/*
 * Coefficient cache layout:
 * 5 coefficients for each cent of cutoff, stored in chunks of 128 cents and allocated when needed.
 *
 * A dense typed array like this is much faster
 * to look up than a Map with an object per entry,
 * and only the regions that are actually used take up memory.
 */
const CHUNK_BITS = 7;
const CHUNK_MASK = (1 << CHUNK_BITS) - 1;
// The cache covers cutoffs [0, 16384) cents, anything outside is computed directly
const CACHE_MAX_CENTS = 16_384;
const CHUNKS_PER_RESONANCE = CACHE_MAX_CENTS >> CHUNK_BITS;

// Coefficient chunks for a single resonance value.
type CoefficientChunks = (Float64Array | undefined)[];

/**
 * Cached filter coefficients.
 * Key is resonanceCb, then cutoff cents.
 *
 * Stored per-synth as synths can have different sample rates.
 */
export type FilterCoefficientCache = Map<number, CoefficientChunks>;

export class LowpassFilter {
    /**
     * For smoothing the filter cutoff frequency.
     * This is per filter, as it depends on the sample rate.
     */
    public readonly smoothingConstant: number;
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
     * The coefficient cache of this filter's synthesizer.
     */
    private readonly coefficientCache: FilterCoefficientCache;
    /**
     * The coefficient chunks for the resonance this filter last used.
     */
    private chunks: CoefficientChunks = [];
    /**
     * The resonance that `chunks` belong to.
     */
    private chunksResonance = -1;

    /**
     * Initializes a new instance of the filter.
     * @param sampleRate the sample rate of the audio engine in Hz.
     * @param coefficientCache the coefficient cache of the synthesizer.
     */
    public constructor(
        sampleRate: number,
        coefficientCache: FilterCoefficientCache
    ) {
        this.sampleRate = sampleRate;
        this.maxCutoff = sampleRate * 0.45;
        this.smoothingConstant =
            FILTER_SMOOTHING_FACTOR * (44_100 / sampleRate);
        this.coefficientCache = coefficientCache;
    }

    public static initCache(sampleRate: number) {
        const cache: FilterCoefficientCache = new Map();
        // Precompute selected cutoffs for 0q (most common)
        const dummy = new LowpassFilter(sampleRate, cache);
        dummy.resonanceCb = 0;
        // 8000 is roughly 830 Hz and 13,500 is max
        for (let i = 8000; i < 13_500; i++) {
            dummy.currentInitialFc = i;
            dummy.calculateCoefficients(i);
        }
        return cache;
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
        if (cutoffCents < 0 || cutoffCents >= CACHE_MAX_CENTS) {
            // Outside the cache range, compute directly
            this.computeCoefficients(cutoffCents);
            return;
        }

        // Resonance rarely changes, so the chunk list is kept until it does
        const qCb = this.resonanceCb;
        if (this.chunksResonance !== qCb) {
            let chunks = this.coefficientCache.get(qCb);
            if (chunks === undefined) {
                chunks = new Array<Float64Array | undefined>(
                    CHUNKS_PER_RESONANCE
                );
                this.coefficientCache.set(qCb, chunks);
            }
            this.chunks = chunks;
            this.chunksResonance = qCb;
        }

        const chunkIndex = cutoffCents >> CHUNK_BITS;
        let chunk = this.chunks[chunkIndex];
        if (chunk === undefined) {
            // NaN marks coefficients that were not computed yet
            chunk = new Float64Array(5 << CHUNK_BITS).fill(Number.NaN);
            this.chunks[chunkIndex] = chunk;
        }

        const offset = (cutoffCents & CHUNK_MASK) * 5;
        if (Number.isNaN(chunk[offset])) {
            // Compute and cache the coefficients
            this.computeCoefficients(cutoffCents);
            chunk[offset] = this.a0;
            chunk[offset + 1] = this.a1;
            chunk[offset + 2] = this.a2;
            chunk[offset + 3] = this.a3;
            chunk[offset + 4] = this.a4;
            return;
        }
        this.a0 = chunk[offset];
        this.a1 = chunk[offset + 1];
        this.a2 = chunk[offset + 2];
        this.a3 = chunk[offset + 3];
        this.a4 = chunk[offset + 4];
    }

    /**
     * Calculates the filter coefficients based on the current resonance and cutoff frequency, without caching.
     * @param cutoffCents The cutoff frequency in cents, an integer.
     */
    private computeCoefficients(cutoffCents: number) {
        const qCb = this.resonanceCb;
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

        this.a0 = b0 / a0;
        this.a1 = b1 / a0;
        this.a2 = b2 / a0;
        this.a3 = a1 / a0;
        this.a4 = a2 / a0;
    }
}
