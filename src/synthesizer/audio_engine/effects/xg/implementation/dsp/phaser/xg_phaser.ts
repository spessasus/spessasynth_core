import { chop32, PHASE_MASK, triangle } from "../xg_dsp_program";
import { XGVariationProgram } from "../xg_variation_program";
import { LFO_RATE } from "../xg_dsp_tables";

// Input EQ push lists (b0, b1, a1): low and high shelves of the left and right sides
const LIST_LOW_LEFT = [0x6e, 0x6d, 0x6f];
const LIST_HIGH_LEFT = [0x71, 0x70, 0x72];
const LIST_LOW_RIGHT = [0x74, 0x73, 0x75];
const LIST_HIGH_RIGHT = [0x77, 0x76, 0x78];

/**
 * The category 1 coefficients that the original never writes (0x79 and 0x9c become integers).
 */
const UNWRITTEN_CATEGORY_1 = [
    0x79, 0x7a, 0x81, 0x88, 0x8b, 0x8c, 0x8f, 0x90, 0x93, 0x94, 0x97, 0x98,
    0x9b, 0x9c, 0xa8, 0xab, 0xac, 0xaf, 0xb0, 0xb3, 0xb4, 0xb7, 0xb8, 0xbb
];

/**
 * The S-YXG50 phaser program, shared by PHASER 1 and PHASER 2.
 *
 * Two chains of five first-order allpasses, one per side, are swept by an exponential triangle LFO
 * (the second side with a phase offset). Selected stages of both chains feed back and form the outputs.
 *
 * The phaser is the only S-YXG50 category 1 program: 0x79 and 0x9c become the LFO step and phase offset
 * integers, 0x82 and 0x9d are scaled by 8, 0x83 and 0x9e by 2^-19, the slots the phaser does not use are never written.
 */
export abstract class XGPhaserBase extends XGVariationProgram {
    public static override readonly memorySize = 0;
    protected override readonly unwrittenCoefficients = UNWRITTEN_CATEGORY_1;
    /**
     * The LFO step and phase offset (coefficients 0x79 and 0x9c).
     */
    private sweepStep = 0;
    private sweepOffset = 0;
    // Input EQ states
    private eqXL = 0;
    private eqYL = 0;
    private eqZL = 0;
    private eqXR = 0;
    private eqYR = 0;
    private eqZR = 0;
    // Allpass chain states: the previous input and the five previous stage outputs of each chain
    private readonly chainA = new Float32Array(6);
    private readonly chainB = new Float32Array(6);

    public constructor(
        sampleRate: number,
        maxBufferSize: number,
        memory: Float32Array
    ) {
        super(sampleRate, maxBufferSize, memory, 1);
    }

    protected render(
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        outputGain: number
    ) {
        const c = this.coefficients;
        const inL = this.inputLeft;
        const inR = this.inputRight;
        const lb0L = c[0x6e],
            lb1L = c[0x6d],
            la1L = c[0x6f],
            hb0L = c[0x71],
            hb1L = c[0x70],
            ha1L = c[0x72],
            lb0R = c[0x74],
            lb1R = c[0x73],
            la1R = c[0x75],
            hb0R = c[0x77],
            hb1R = c[0x76],
            ha1R = c[0x78];
        const dryLeftGain = c[0xa2] * outputGain,
            dryRightGain = c[0xa6] * outputGain,
            leftGain = c[0x84],
            rightToLeft = c[0x85],
            rightGain = c[0x9f];
        const selA3 = c[0x7b],
            selA4 = c[0x7c],
            selA5 = c[0x7d],
            selB3 = c[0x7e],
            selB4 = c[0x7f],
            selB5 = c[0x80];
        const outA = c[0xa3],
            outB2 = c[0xa4],
            outB4 = c[0xa5],
            outRight = c[0xa7];
        const feedAA = c[0x86],
            feedBA = c[0x87],
            feedAB = c[0xa0],
            feedBB = c[0xa1];
        const biasA = c[0x82],
            depthA = c[0x83],
            biasB = c[0x9d],
            depthB = c[0x9e];
        const step = this.sweepStep,
            offset = this.sweepOffset;
        const a = this.chainA;
        const b = this.chainB;
        let { eqXL, eqYL, eqZL, eqXR, eqYR, eqZR, lfoPhase } = this;
        for (let i = 0; i < sampleCount; i++) {
            // Input EQ, a low shelf then a high shelf on each side
            let x = inL[i];
            let y = lb0L * x + la1L * eqYL + lb1L * eqXL;
            eqZL = hb1L * eqYL + ha1L * eqZL + y * hb0L;
            eqXL = x;
            eqYL = y;
            x = inR[i];
            y = la1R * eqYR + lb0R * x + lb1R * eqXR;
            eqZR = hb1R * eqYR + ha1R * eqZR + y * hb0R;
            eqXR = x;
            eqYR = y;
            const left = eqZL;
            const right = eqZR;
            const wetInL = leftGain * left + rightToLeft * right;
            const wetInR = rightGain * right;

            // Stage mixes and the outputs, from the previous states
            const mixA = selA4 * a[4] + selA3 * a[3] + selA5 * a[5];
            const mixB = selB5 * b[5] + selB4 * b[4] + selB3 * b[3];
            const wetL = mixA * outA + outB4 * b[4] + outB2 * b[2];
            const wetR = mixB * outRight;

            // Exponential LFO: 1 - 2^v / 256 with the integer part as a shift
            lfoPhase = (lfoPhase + step) & PHASE_MASK;
            const vA = chop32(chop32(triangle(lfoPhase) * depthA) + biasA);
            const vB = chop32(
                chop32(triangle((lfoPhase - offset) & PHASE_MASK) * depthB) +
                    biasB
            );
            const nA = Math.trunc(vA);
            const nB = Math.trunc(vB);
            const coefficientA = chop32(
                1 -
                    chop32(
                        chop32((1 << (nA & 0x1f)) * chop32(vA - nA + 1)) / 256
                    )
            );
            const coefficientB = chop32(
                1 -
                    chop32(
                        chop32((1 << (nB & 0x1f)) * chop32(vB - nB + 1)) / 256
                    )
            );

            // Allpass chains
            let input = mixB * feedBA + mixA * feedAA + wetInL;
            for (let k = 1; k < 6; k++) {
                const out =
                    coefficientA * a[k] + a[k - 1] - input * coefficientA;
                a[k - 1] = input;
                input = out;
            }
            a[5] = input;
            input = mixA * feedAB + mixB * feedBB + wetInR;
            for (let k = 1; k < 6; k++) {
                const out =
                    coefficientB * b[k] + b[k - 1] - input * coefficientB;
                b[k - 1] = input;
                input = out;
            }
            b[5] = input;

            outputLeft[i] = wetL * outputGain + dryLeftGain * left;
            outputRight[i] = wetR * outputGain + dryRightGain * right;
        }
        this.eqXL = eqXL;
        this.eqYL = eqYL;
        this.eqZL = eqZL;
        this.eqXR = eqXR;
        this.eqYR = eqYR;
        this.eqZR = eqZR;
        this.lfoPhase = lfoPhase;
    }

    protected override resetState() {
        this.eqXL = this.eqYL = this.eqZL = 0;
        this.eqXR = this.eqYR = this.eqZR = 0;
        this.chainA.fill(0);
        this.chainB.fill(0);
    }

    protected override pushCoefficients(
        list: ArrayLike<number>,
        count = list.length,
        offset = 0
    ) {
        super.pushCoefficients(list, count, offset);
        if (!this.pushEnabled) return;
        const c = this.coefficients;
        for (let i = offset; i < offset + count; i++) {
            const k = list[i];
            switch (k) {
                case 0x82:
                case 0x9d: {
                    c[k] = Math.fround(c[k] * 8);
                    break;
                }
                case 0x83:
                case 0x9e: {
                    c[k] = Math.fround(c[k] * 2 ** -19);
                    break;
                }
                case 0x79: {
                    this.sweepStep = Math.trunc(
                        this.rawCoefficient(0x79) * this.rateInverse * 4_194_304
                    );
                    break;
                }
                case 0x9c: {
                    this.sweepOffset = Math.trunc(
                        this.rawCoefficient(0x9c) * 4_194_304
                    );
                    break;
                }
            }
        }
    }

    /**
     * Writes the LFO rate word.
     */
    protected sweepRate() {
        this.coefficientWords[0x79] = LFO_RATE[this.params[0]];
        this.pushCoefficients([0x79]);
    }

    /**
     * Writes the LFO bias and depth words of both sides.
     * @param biasScaleB The full bias of the second side (512 is the same as the first side).
     */
    protected sweepDepth(biasScaleB: number) {
        const p = this.params;
        const w = this.coefficientWords;
        const biasA = Math.trunc((p[2] * 0x2_00) / 0x7f);
        const biasB = Math.trunc((p[2] * biasScaleB) / 0x7f);
        w[0x82] = biasA;
        w[0x83] = Math.trunc(((0x2_00 - biasA) * p[1]) / 0x7f);
        w[0x9d] = biasB;
        w[0x9e] = Math.trunc(((0x2_00 - biasB) * p[1]) / 0x7f);
        this.pushCoefficients([0x83, 0x9e]);
        this.pushCoefficients([0x82, 0x9d]);
    }

    /**
     * Designs the input EQ low shelves.
     */
    protected lowEqualizer() {
        const p = this.params;
        this.designFirstOrder("lowShelf", p[5], p[6], LIST_LOW_LEFT);
        this.designFirstOrder("lowShelf", p[5], p[6], LIST_LOW_RIGHT);
    }

    /**
     * Designs the input EQ high shelves.
     */
    protected highEqualizer() {
        const p = this.params;
        this.designFirstOrder("highShelf", p[7], p[8], LIST_HIGH_LEFT);
        this.designFirstOrder("highShelf", p[7], p[8], LIST_HIGH_RIGHT);
    }
}
