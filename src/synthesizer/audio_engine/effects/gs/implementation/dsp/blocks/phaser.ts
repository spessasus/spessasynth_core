import { DC_BLOCKER_HZ, FirstOrderFilter } from "./first_order_filter";
import { LFO } from "./lfo";
import { resonanceGain } from "../conversion";

/**
 * The all-pass pole at 32 kHz per Manual value, over 8192 (x 0.45). The Man column of the conversion table is only a
 * label: the real first notch runs from 206 Hz (value 0) through 2 kHz (65, pole 0) to 6.9 kHz (125-127), the same
 * on the SC-88Pro.
 */
// prettier-ignore
const MANUAL_POLES = new Int16Array([
    14_842, 14_696, 14_551, 14_407, 14_265, 14_124, 13_985, 13_846, 13_709, 13_573, 13_439, 13_305, 13_173, 13_042,
    12_912, 12_783, 12_656, 12_529, 12_404, 12_279, 12_156, 11_912, 11_673, 11_438, 11_206, 10_978, 10_754, 10_534,
    10_317, 10_103, 9893, 9686, 9483, 9282, 9084, 8890, 8698, 8509, 8323, 8140, 7959, 7781, 7606, 7433, 7262, 7094,
    6928, 6764, 6603, 6444, 6286, 6131, 5978, 5828, 5679, 5532, 4824, 4159, 3534, 2943, 2386, 1858, 1357, 882, 430,
    0, -410, -802, -1177, -1536, -1880, -2210, -2526, -2831, -3124, -3406, -3678, -3941, -4194, -4439, -4676, -4905,
    -5127, -5342, -5550, -5753, -5949, -6140, -6326, -6506, -6682, -6853, -7020, -7183, -7341, -7496, -7647, -7795,
    -7939, -8080, -8218, -8353, -8486, -8615, -8742, -8866, -8988, -9108, -9225, -9340, -9453, -9564, -9674, -9781,
    -9887, -9990, -10_093, -10_193, -10_292, -10_390, -10_486, -10_581, -10_674, -10_766, -10_857, -10_947,
    -10_947, -10_947
]);

/**
 * How far the LFO may raise the pole per Manual value, over 128. Low values sweep less, so the pole stays under
 * about 0.9 at full depth.
 */
// prettier-ignore
const MANUAL_SWEEPS = new Uint8Array([
    16, 17, 19, 20, 22, 23, 25, 26, 28, 29, 30, 32, 33, 34, 36, 37, 38, 40, 41, 42, 44, 47, 49, 51, 53, 55, 57, 60,
    62, 64, 66, 69, 71, 73, 75, 77, 79, 81, 83, 85, 87, 89, 91, 92, 94, 96, 97, 99, 101, 102, 103, 104, 106, 107,
    108, 110, 118, 123, 127
]);

/**
 * The number of first order all-pass sections per channel.
 */
const SECTIONS = 8;

/**
 * The phaser: per channel the input plus the resonance feedback, a DC blocker and eight equal first order
 * all-pass sections. Mixed with the dry signal (by the effect) the chain's 180 degree points become notches.
 *
 * One LFO moves the pole of every section and channel. It raises the pole from the Manual position, so the notches
 * sweep down. The sweep is linear in the 32 kHz pole, so the pole is worked out at 32 kHz and moved to the host rate
 * with the same delay at low frequencies. That keeps the low notches and the resonance peaks in place. The upper
 * notches cannot follow at another rate: at 32 kHz the sections crowd them toward 16 kHz.
 * @internal
 */
export class Phaser {
    private readonly lfo: LFO;
    /**
     * 32 kHz over the host rate.
     */
    private readonly scale: number;
    /**
     * The feedback read, one 32 kHz sample back: the whole host samples (at least the one of the loop) and the
     * fraction toward the next older output.
     */
    private readonly feedbackDelay: number;
    private readonly feedbackFraction: number;
    /**
     * The outputs kept per channel, enough for the feedback read (two up to 64 kHz).
     */
    private readonly historyLength: number;
    private readonly dcBlockers: FirstOrderFilter[];
    /**
     * The all-pass states, `SECTIONS` per channel.
     */
    private readonly states: Float64Array;
    /**
     * The chain outputs of the last samples per channel, newest first.
     */
    private readonly history: Float64Array;
    private coefficient = 0;
    private manual = 0;
    private sweep = 0;
    private depth = 0;
    private resonance = 0;

    /**
     * @param sampleRate The sample rate.
     * @param channels The number of chains.
     */
    public constructor(sampleRate: number, channels: number) {
        this.lfo = new LFO(sampleRate);
        this.scale = 32_000 / sampleRate;
        const delay = Math.max(1, sampleRate / 32_000);
        this.feedbackDelay = Math.floor(delay);
        this.feedbackFraction = delay - this.feedbackDelay;
        this.historyLength = this.feedbackDelay + 1;
        this.dcBlockers = new Array<FirstOrderFilter>(channels);
        for (let i = 0; i < channels; i++) {
            this.dcBlockers[i] = new FirstOrderFilter(sampleRate);
            this.dcBlockers[i].setHighPass(DC_BLOCKER_HZ);
        }
        this.states = new Float64Array(channels * SECTIONS);
        this.history = new Float64Array(channels * this.historyLength);
    }

    /**
     * @param value The Manual parameter (0-127).
     */
    public setManual(value: number) {
        this.manual = (0.45 * MANUAL_POLES[value]) / 8192;
        this.sweep = (0.9 * MANUAL_SWEEPS[Math.min(value, 58)]) / 128;
    }

    /**
     * @param hz The LFO rate.
     */
    public setRate(hz: number) {
        this.lfo.setRate(hz);
    }

    /**
     * @param depth The depth, 0 to 1 (the share of the Manual's sweep).
     */
    public setDepth(depth: number) {
        this.depth = depth;
    }

    /**
     * @param value The Resonance parameter (0-127).
     */
    public setResonance(value: number) {
        this.resonance = resonanceGain(value);
    }

    /**
     * Moves the LFO and the pole on by one sample. Call once per sample before `process`.
     */
    public step() {
        const pole =
            this.manual +
            this.sweep * this.depth * Math.abs(this.lfo.process());
        // A section delays low frequencies by 1 / (fs t) seconds, so t scales with the rate
        const t = ((1 - pole) / (1 + pole)) * this.scale;
        this.coefficient = (t - 1) / (t + 1);
    }

    /**
     * @param channel The chain.
     * @param x The input sample.
     * @returns The chain output.
     */
    public process(channel: number, x: number) {
        const { states, history, coefficient: a } = this;
        const h = channel * this.historyLength;
        // The feedback is one 32 kHz sample old: between two outputs at higher rates
        const newer = history[h + this.feedbackDelay - 1];
        const feedback =
            newer +
            (history[h + this.feedbackDelay] - newer) * this.feedbackFraction;
        let y = this.dcBlockers[channel].process(x + this.resonance * feedback);
        const end = (channel + 1) * SECTIONS;
        for (let i = channel * SECTIONS; i < end; i++) {
            const out = a * y + states[i];
            states[i] = y - a * out;
            y = out;
        }
        for (let i = h + this.historyLength - 1; i > h; i--) {
            history[i] = history[i - 1];
        }
        history[h] = y;
        return y;
    }

    public clear() {
        this.lfo.clear();
        this.states.fill(0);
        this.history.fill(0);
        for (const dcBlocker of this.dcBlockers) dcBlocker.clear();
    }
}
