import { XGVariationProgram } from "./xg_variation_program";

// Input low shelf push lists (b0, b1, a1), the shelf is split into two sections
export const LIST_LOW_A = [0x70, 0x6f, 0x71];
export const LIST_LOW_B = [0x73, 0x72, 0x74];

/**
 * The category 2 coefficients that the original never writes.
 */
const UNWRITTEN_CATEGORY_2 = [0x75, 0x7a, 0x7d, 0x80, 0xae];

/**
 * The base for the S-YXG50 category 2 variation programs (3-band EQ, distortion, early reflections).
 * They process a mono sum of the input through a two-section low shelf, keeping scaled copies
 * of the dry input that the routines mix back in.
 * Any of 0x76, 0x7a, 0x7d and 0x80 sets 0x76 to their product.
 */
export abstract class XGMonoVariationProgram extends XGVariationProgram {
    protected override readonly unwrittenCoefficients = UNWRITTEN_CATEGORY_2;
    /**
     * The mono input after the low shelf.
     */
    protected readonly mono;
    /**
     * The scaled dry input copies (coefficients 0xad and 0xb1).
     */
    protected readonly dryLeft;
    protected readonly dryRight;

    // Low shelf states
    private monoX = 0;
    private monoY = 0;
    private monoShelfY = 0;
    // Output filter states (shelf, peaking, shelf)
    private postX = 0;
    private postY = 0;
    private peakX2 = 0;
    private peakY = 0;
    private peakY2 = 0;
    private postShelfY = 0;

    public constructor(
        sampleRate: number,
        maxBufferSize: number,
        memory: Float32Array
    ) {
        super(sampleRate, maxBufferSize, memory, 2);
        this.mono = new Float32Array(maxBufferSize);
        this.dryLeft = new Float32Array(maxBufferSize);
        this.dryRight = new Float32Array(maxBufferSize);
    }

    protected override resetState() {
        this.monoX = this.monoY = this.monoShelfY = 0;
        this.postX = this.postY = 0;
        this.peakX2 = this.peakY = this.peakY2 = 0;
        this.postShelfY = 0;
    }

    protected override pushCoefficients(
        list: ArrayLike<number>,
        count = list.length,
        offset = 0
    ) {
        super.pushCoefficients(list, count, offset);
        if (!this.pushEnabled) return;
        for (let i = offset; i < offset + count; i++) {
            const k = list[i];
            if (k === 0x76 || k === 0x7a || k === 0x7d || k === 0x80) {
                this.coefficients[0x76] = Math.fround(
                    Math.fround(
                        Math.fround(
                            this.rawCoefficient(0x80) *
                                this.rawCoefficient(0x7d)
                        ) * this.rawCoefficient(0x7a)
                    ) * this.rawCoefficient(0x76)
                );
                return;
            }
        }
    }

    /**
     * Fills {@link mono}, {@link dryLeft} and {@link dryRight} from the input.
     * @param sampleCount The number of samples.
     */
    protected mixMono(sampleCount: number) {
        const c = this.coefficients;
        const inL = this.inputLeft;
        const inR = this.inputRight;
        const mono = this.mono;
        const dryLeftGain = c[0xad],
            dryRightGain = c[0xb1],
            leftGain = c[0x6d],
            rightGain = c[0x6e];
        const b1A = c[0x6f],
            b0A = c[0x70],
            a1A = c[0x71],
            b1B = c[0x72],
            b0B = c[0x73],
            a1B = c[0x74];
        let { monoX, monoY, monoShelfY } = this;
        for (let i = 0; i < sampleCount; i++) {
            const l = inL[i];
            const r = inR[i];
            this.dryLeft[i] = dryLeftGain * l;
            this.dryRight[i] = dryRightGain * r;
            const x = rightGain * r + leftGain * l;
            const y = b1A * monoX + b0A * x + a1A * monoY;
            monoShelfY = y * b0B + b1B * monoY + a1B * monoShelfY;
            monoX = x;
            monoY = y;
            mono[i] = monoShelfY;
        }
        this.monoX = monoX;
        this.monoY = monoY;
        this.monoShelfY = monoShelfY;
    }

    /**
     * Runs the output filters on the mono signal in place: a first-order section (0xa2-0xa4),
     * a second-order section (0xa5-0xa9) and another first-order section (0xaa-0xac).
     * @param buffer The mono signal.
     * @param sampleCount The number of samples.
     */
    protected filterOutput(buffer: Float32Array, sampleCount: number) {
        const c = this.coefficients;
        const hb1 = c[0xa2],
            hb0 = c[0xa3],
            ha1 = c[0xa4],
            ma2 = c[0xa5],
            ma1 = c[0xa6],
            mb2 = c[0xa7],
            mb1 = c[0xa8],
            mb0 = c[0xa9],
            sb1 = c[0xaa],
            sb0 = c[0xab],
            sa1 = c[0xac];
        let { postX, postY, peakX2, peakY, peakY2, postShelfY } = this;
        for (let i = 0; i < sampleCount; i++) {
            const x = buffer[i];
            const first = ha1 * postY + hb1 * postX + hb0 * x;
            postX = x;
            const peak =
                ma2 * peakY2 +
                ma1 * peakY +
                mb2 * peakX2 +
                mb1 * postY +
                mb0 * first;
            // noinspection JSSuspiciousNameCombination
            peakX2 = postY;
            postY = first;
            postShelfY = sb1 * peakY + peak * sb0 + sa1 * postShelfY;
            peakY2 = peakY;
            peakY = peak;
            buffer[i] = postShelfY;
        }
        this.postX = postX;
        this.postY = postY;
        this.peakX2 = peakX2;
        this.peakY = peakY;
        this.peakY2 = peakY2;
        this.postShelfY = postShelfY;
    }

    /**
     * Writes the outputs: the processed mono signal (0xb0, 0xb3) plus the dry copies.
     * @param buffer The processed mono signal.
     * @param outputLeft The left output, overwritten.
     * @param outputRight The right output, overwritten.
     * @param sampleCount The number of samples.
     * @param outputGain The output scale for the current connection.
     */
    protected mixOutput(
        buffer: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        outputGain: number
    ) {
        const outL = this.coefficients[0xb0],
            outR = this.coefficients[0xb3];
        const dryL = this.dryLeft;
        const dryR = this.dryRight;
        for (let i = 0; i < sampleCount; i++) {
            const y = buffer[i];
            outputLeft[i] = (outL * y + dryL[i]) * outputGain;
            outputRight[i] = (outR * y + dryR[i]) * outputGain;
        }
    }

    /**
     * Writes the mono input level words: L+R in the system mode, their average in the insertion mode.
     */
    protected monoInputLevel() {
        const w = this.coefficientWords;
        w[0x6d] = w[0x6e] = this.insertion ? 0x1_00 : 0x2_00;
        this.pushCoefficients([0x6d, 0x6e]);
    }
}
