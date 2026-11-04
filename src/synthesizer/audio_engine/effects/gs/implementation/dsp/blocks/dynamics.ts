import { DC_BLOCKER_HZ, FirstOrderFilter } from "./first_order_filter";
import { DelayLine } from "./delay_line";
import { MonoMix } from "./mono_mix";
import { saturate } from "../glue";

/**
 * The rate the hardware's per sample laws were measured at.
 */
const HARDWARE_RATE = 32_000;

/**
 * The detector level above which the gain comes down, the same for both modes.
 */
const THRESHOLD = 519 / 65_536;

/**
 * The gain the program starts from on a type select (about -100 dB), so a fresh compressor or limiter fades in.
 * The SC-88Pro does that too.
 */
const INITIAL_GAIN = 1e-5;

/**
 * The limiter's gain floor recovery per 32 kHz sample. It is what opens the gain from closed, so it sets how long
 * the fade-in after a type select takes. This is SC-VA's effective value (register 0x3a is 1.19e-7, the rest is its
 * float seeds), since the fade-in is audible and the SC-88Pro has it too.
 */
const LIMITER_FLOOR = 1.34e-7;

/**
 * The limiter's gain curves, three lines `g = slope t + offset` split at t = 0.01 and 0.1. The upper two are the
 * chords of `t ^ e` (e = 1 - 1 / ratio), the first one keeps a floor, so the lower ratios never close fully.
 */
const LIMITER_FIRST_SEGMENT = [
    [15.26, 0.1624],
    [7.5402, 0.024],
    [2.8669, 0.002_747],
    [1, 0]
];
const LIMITER_EXPONENTS = [0.25, 0.5, 0.75, 1];

/**
 * The detector gain of a threshold parameter: 1/256 to 4, 0.474 dB per step.
 * @param value The parameter (0-127, 127 is the highest gain).
 * @internal
 */
export function detectorGain(value: number) {
    return 4 * 2 ** ((-10 * (127 - value)) / 127);
}

/**
 * The compressor's recovery per second of a sustain parameter (0.09 to 2.25).
 * @param value The parameter (0-127).
 * @internal
 */
export function recoveryRate(value: number) {
    return 2 ** (7.5583 + value / 27.33) / 2097.15;
}

/**
 * The Compressor and Limiter of the Sound Canvas: one detector on the input under the current gain, a lookahead
 * line, and a gain that falls by the overshoot per sample and recovers below the threshold. Both end with the post
 * gain, saturating at the internal full scale.
 *
 * The laws were measured per 32 kHz sample and are mapped to the host rate by time.
 * @internal
 */
export abstract class Dynamics {
    protected readonly sampleRate: number;
    /**
     * The 32 kHz samples per host sample.
     */
    protected readonly step: number;
    protected detectorGain = 0;
    protected postGain = 1;
    protected gain = INITIAL_GAIN;
    private readonly dcBlocker: FirstOrderFilter;
    private readonly lookahead: DelayLine;
    private readonly lookaheadSamples: number;
    private readonly smoothing: number;
    private envelope = INITIAL_GAIN;

    /**
     * @param sampleRate The sample rate.
     * @param lookahead The lookahead in seconds.
     */
    protected constructor(sampleRate: number, lookahead: number) {
        this.sampleRate = sampleRate;
        this.step = HARDWARE_RATE / sampleRate;
        this.dcBlocker = new FirstOrderFilter(sampleRate);
        this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        // Whole samples: interpolating the line would low pass the signal
        this.lookaheadSamples = Math.round(lookahead * sampleRate);
        this.lookahead = new DelayLine(this.lookaheadSamples);
        // A one-pole smoother of the gain, 0.672 per 32 kHz sample (78 us)
        this.smoothing = 1 - 0.671_875 ** this.step;
    }

    /**
     * @param gain The gain after the dynamics, before they saturate.
     */
    public setPostGain(gain: number) {
        this.postGain = gain;
    }

    /**
     * @param x The input sample.
     * @returns The output sample.
     */
    public abstract process(x: number): number;

    public clear() {
        this.dcBlocker.clear();
        this.lookahead.clear();
        this.gain = INITIAL_GAIN;
        this.envelope = INITIAL_GAIN;
    }

    /**
     * Writes the input into the lookahead and runs the detector on it.
     * @param x The input sample.
     * @returns Whether the input was over the threshold (the gain came down), else the gain recovers.
     */
    protected detect(x: number) {
        const h = this.dcBlocker.process(x);
        this.lookahead.write(h);
        // The detector sees the current input under the gain. It saturates at full scale before the last x4
        // That way a hot input can close the gain in one step
        const over =
            3.968_75 *
                Math.min(this.detectorGain * Math.abs(this.gain * h), 1) -
            THRESHOLD;
        if (over < 0) return false;
        this.gain *= (1 - Math.min(over, 1)) ** this.step;
        return true;
    }

    /**
     * @param g The gain of this sample.
     * @returns The lookahead's output under the smoothed gain.
     */
    protected apply(g: number) {
        this.envelope += this.smoothing * (g - this.envelope);
        return this.lookahead.read(this.lookaheadSamples) * this.envelope;
    }
}

/**
 * The compressor: 1 ms lookahead, the gain recovers linearly, the output has a makeup gain (the "Attack" parameter,
 * which sets how far below the fixed output ceiling the knee sits, the manuals call it Sustain, see `GSCompressor`)
 * and a two-sample average.
 * @internal
 */
export class Compressor extends Dynamics {
    /**
     * The output average, the same skewed two-sample mean as the mono input.
     */
    private readonly average: MonoMix;
    private makeup = 1;
    private recovery = 0;

    /**
     * @param sampleRate The sample rate.
     * @param lookahead The lookahead in seconds (Bass Multi's is longer).
     */
    public constructor(sampleRate: number, lookahead = 0.001) {
        super(sampleRate, lookahead);
        this.average = new MonoMix(sampleRate);
    }

    /**
     * The makeup gain. The detector sees the signal at the output's level, so the output ceiling stays put and the
     * knee moves down as the gain goes up.
     * @param gain The gain below the knee, 1/256 to 4 (the output has 16x of it).
     */
    public setMakeup(gain: number) {
        this.detectorGain = gain;
        this.makeup = gain;
    }

    /**
     * How fast the gain comes back, linear in amplitude.
     * @param perSecond The rise of the gain (1 is the full gain) per second.
     */
    public setRecoveryRate(perSecond: number) {
        this.recovery = perSecond / this.sampleRate;
    }

    public process(x: number) {
        if (!this.detect(x)) this.gain = Math.min(1, this.gain + this.recovery);
        const compressed = saturate(
            saturate(4 * this.apply(this.gain)) * this.makeup
        );
        // Two samples averaged and x4: 2 (y[n] + y[n-1]) at 32 kHz
        const averaged = saturate(
            4 * this.average.process(compressed, compressed)
        );
        return saturate(averaged * this.postGain);
    }

    public clear() {
        super.clear();
        this.average.clear();
    }
}

/**
 * The limiter: 3.75 ms lookahead, the gain recovers exponentially and goes through the ratio curve.
 * @internal
 */
export class Limiter extends Dynamics {
    private readonly floor: number;
    private readonly slopes = new Float64Array(3);
    private readonly offsets = new Float64Array(3);
    private release = 1;

    public constructor(sampleRate: number) {
        super(sampleRate, 0.003_75);
        this.floor = LIMITER_FLOOR * this.step;
    }

    /**
     * @param gain The threshold as the detector gain (1/256 to 4, higher is a lower threshold).
     */
    public setThreshold(gain: number) {
        this.detectorGain = gain;
    }

    /**
     * How fast the gain comes back, exponentially.
     * @param timeConstant The time the gain takes to grow by e, in seconds.
     */
    public setRelease(timeConstant: number) {
        this.release = Math.exp(1 / (timeConstant * this.sampleRate));
    }

    /**
     * @param ratio The ratio index (0-3: 1.5:1 (really 4:3), 2:1, 4:1, 100:1).
     */
    public setRatio(ratio: number) {
        const e = LIMITER_EXPONENTS[ratio];
        this.slopes[0] = LIMITER_FIRST_SEGMENT[ratio][0];
        this.offsets[0] = LIMITER_FIRST_SEGMENT[ratio][1];
        this.slopes[1] = (0.1 ** e - 0.01 ** e) / 0.09;
        this.offsets[1] = 0.01 ** e - this.slopes[1] * 0.01;
        this.slopes[2] = (1 - 0.1 ** e) / 0.9;
        this.offsets[2] = 0.1 ** e - this.slopes[2] * 0.1;
    }

    public process(x: number) {
        if (!this.detect(x)) {
            this.gain = Math.min(1, this.gain * this.release + this.floor);
        }
        const g = this.gain;
        const s = g < 0.01 ? 0 : g < 0.1 ? 1 : 2;
        return saturate(
            this.apply(this.slopes[s] * g + this.offsets[s]) * this.postGain
        );
    }
}
