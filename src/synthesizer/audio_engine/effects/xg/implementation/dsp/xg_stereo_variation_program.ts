import { LFO_RATE } from "./xg_dsp_tables";
import { XGVariationProgram } from "./xg_variation_program";

// Input EQ push lists (b0, b1, a1)
const LIST_LOW_LEFT = [0x7f, 0x7e, 0x80];
const LIST_LOW_RIGHT = [0x99, 0x98, 0x9a];
const LIST_HIGH_LEFT = [0xa8, 0xa7, 0xa9];
const LIST_HIGH_RIGHT = [0x9c, 0x9b, 0x9d];
// Input EQ coefficients (b1, b0, a1): left low, left high, right low, right high
const LIST_EQUALIZER = [
    0x7e, 0x7f, 0x80, 0xa7, 0xa8, 0xa9, 0x98, 0x99, 0x9a, 0x9b, 0x9c, 0x9d
];

/**
 * The base for the S-YXG50 category 0 variation programs
 * (delays, tremolo, auto pan, symphonic, rotary speaker, 2-band EQ).
 * A stereo two-band input EQ runs before every routine,
 * and the LFO integers and rate-dependent values are derived from the coefficients.
 */
export abstract class XGStereoVariationProgram extends XGVariationProgram {
    // LFO steps (rate) and phase offsets, derived from the coefficients.
    // The offsets come from the coefficients 0x6e, 0x79, 0x74, 0x84, 0x88 and 0x8d
    protected lfoStep = 0;
    protected lfoStep2 = 0;
    protected lfoOffset1 = 0;
    protected lfoOffset2 = 0;
    protected lfoOffset3 = 0;
    protected lfoOffset4 = 0;
    protected lfoOffset5 = 0;
    protected lfoOffset6 = 0;

    private readonly equalizerState = new Float64Array(6);

    public constructor(
        sampleRate: number,
        maxBufferSize: number,
        memory: Float32Array
    ) {
        super(sampleRate, maxBufferSize, memory, 0);
    }

    public override reset() {
        this.equalizerState.fill(0);
        super.reset();
    }

    protected override pushCoefficients(
        list: ArrayLike<number>,
        count = list.length,
        offset = 0
    ) {
        super.pushCoefficients(list, count, offset);
        // LFO integers and rate-dependent values
        const inverse = this.rateInverse;
        const depthScale = Math.fround(this.rateRatio * 2048);
        const c = this.coefficients;
        for (let i = offset; i < offset + count; i++) {
            const k = list[i];
            const raw = c[k];
            switch (k) {
                // LFO smoothing feedback and input
                case 0x71:
                case 0x7b:
                case 0x8a:
                case 0x8f: {
                    c[k] = Math.max(0, Math.fround(1 - raw * inverse * 4));
                    break;
                }
                case 0x72:
                case 0x7c:
                case 0x8b:
                case 0x90: {
                    c[k] = Math.min(1, Math.fround(raw * inverse * 4));
                    break;
                }
                // Modulation depths in samples
                case 0x75:
                case 0x76:
                case 0x85:
                case 0x86:
                case 0x95:
                case 0x96:
                case 0xa5: {
                    c[k] = Math.fround(raw * depthScale);
                    break;
                }
                case 0x77: {
                    this.lfoStep = Math.trunc(raw * inverse * 16_777_216);
                    this.lfoStep2 = Math.trunc(
                        c[0x70] * c[0x6d] * raw * inverse * 16_777_216
                    );
                    break;
                }
                case 0x6d:
                case 0x70: {
                    this.lfoStep2 = Math.trunc(
                        c[0x77] * c[0x70] * c[0x6d] * inverse * 16_777_216
                    );
                    break;
                }
                case 0x6e: {
                    this.lfoOffset1 = Math.trunc(raw * 4_194_304);
                    break;
                }
                case 0x79: {
                    this.lfoOffset2 = Math.trunc(raw * 4_194_304);
                    break;
                }
                case 0x74: {
                    this.lfoOffset3 = Math.trunc(raw * 4_194_304);
                    break;
                }
                case 0x84: {
                    this.lfoOffset4 = Math.trunc(raw * 4_194_304);
                    break;
                }
                case 0x88: {
                    this.lfoOffset5 = Math.trunc(raw * 4_194_304);
                    break;
                }
                case 0x8d: {
                    this.lfoOffset6 = Math.trunc(raw * 4_194_304);
                    break;
                }
            }
        }
    }

    /**
     * Runs the input EQ (two first-order sections per side).
     * @param inputLeft The left input.
     * @param inputRight The right input.
     * @param sampleCount The number of samples.
     * @param gain The input level.
     */
    protected override prepareInput(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        sampleCount: number,
        gain: number
    ) {
        this.equalizeStereo(
            inputLeft,
            inputRight,
            this.inputLeft,
            this.inputRight,
            sampleCount,
            gain,
            LIST_EQUALIZER,
            this.equalizerState
        );
    }

    /**
     * Writes and pushes the LFO rate coefficient word.
     * @param rate The LFO frequency parameter.
     */
    protected lfoRate(rate: number) {
        this.coefficientWords[0x77] = LFO_RATE[rate];
        this.pushCoefficients([0x77]);
    }

    /**
     * Shapes one LFO smoothing stage (input, feedback, offset, center) from the rate.
     * The input takes half of the rate mantissa, or the rate itself when the feedback is doubled.
     * @param list The shaping coefficient list.
     * @param doubled True for the stage with the doubled feedback rate.
     */
    protected shapeSmoothLFO(list: readonly number[], doubled = false) {
        const w = this.coefficientWords;
        const rate = w[0x77];
        if (doubled) {
            // One more exponent step, saturating at the largest mantissa
            const exponent = (rate & 0x3_80) + 0x80;
            w[list[0]] = rate;
            w[list[1]] = exponent < 0x3_80 ? exponent | (rate & 0x7f) : 0x3_7f;
        } else {
            w[list[0]] = ((rate >> 1) & 0x3f) | (rate & 0x3_80);
            w[list[1]] = rate;
        }
        w[list[2]] = 0x1_00;
        w[list[3]] = 0x3_c0;
        this.pushCoefficients(list);
    }

    /**
     * The amplitude modulation depth word (-value / 127).
     * @param value The depth, signed.
     */
    protected amplitudeDepth(value: number) {
        // The full depth words avoid the ambiguous 0x200
        if (value === 127) return 0x2_01;
        if (value === -127) return 0x1_ff;
        return -Math.trunc((value * 0x2_00) / 0x7f) & 0x3_ff;
    }

    /**
     * The pitch modulation depth word (value * 128 / 127).
     * @param value The depth (0-255).
     */
    protected pitchDepth(value: number) {
        return Math.trunc((value * 0x80) / 0x7f);
    }

    /**
     * Designs the low band of the input EQ.
     * @param lowFrequency The low shelf frequency index.
     * @param lowGain The low shelf gain index.
     * @param boosted True for the +3 dB low shelf.
     */
    protected designLowEqualizer(
        lowFrequency: number,
        lowGain: number,
        boosted = false
    ) {
        const shape = boosted ? "lowShelfBoosted" : "lowShelf";
        this.designFirstOrder(shape, lowFrequency, lowGain, LIST_LOW_LEFT);
        this.designFirstOrder(shape, lowFrequency, lowGain, LIST_LOW_RIGHT);
    }

    /**
     * Designs the high band of the input EQ.
     * @param highFrequency The high shelf frequency index.
     * @param highGain The high shelf gain index.
     */
    protected designHighEqualizer(highFrequency: number, highGain: number) {
        this.designFirstOrder(
            "highShelf",
            highFrequency,
            highGain,
            LIST_HIGH_LEFT
        );
        this.designFirstOrder(
            "highShelf",
            highFrequency,
            highGain,
            LIST_HIGH_RIGHT
        );
    }
}
