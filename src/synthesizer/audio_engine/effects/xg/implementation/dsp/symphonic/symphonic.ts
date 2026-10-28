import { XGStereoVariationProgram } from "../xg_stereo_variation_program";
import {
    chop32,
    PHASE_MASK,
    triangle,
    TRIANGLE_SCALE,
    type XGParameterRanges
} from "../xg_dsp_program";
import { type XGVariationPreset } from "../xg_variation_program";
import { DELAY_OFFSET, PAN_LEFT, PAN_RIGHT } from "../xg_dsp_tables";

const PARAMETER_RANGES: XGParameterRanges = {
    5: [8, 40],
    6: [52, 76],
    7: [28, 58],
    8: [52, 76]
};

// LFO shaping push lists (input smoothing, feedback smoothing, offset, center)
const LIST_SHAPE_A = [0x72, 0x71, 0x6f, 0x73];
const LIST_SHAPE_B = [0x7c, 0x7b, 0x7a, 0x7d];
const LIST_SHAPE_C = [0x8b, 0x8a, 0x89, 0x8c];
const LIST_TAPS = [0x28, 0x29, 0x33, 0x34, 0x2d, 0x2e];
const LIST_OUTPUT = [0xb2, 0xb4, 0xb5, 0xb8, 0xb9, 0xba];

/**
 * SYMPHONIC (`44 00`): three delay taps of a mono line, each modulated by a smoothed slow triangle
 * and a fast triangle of a second LFO phase.
 */
export class XGSymphonic extends XGStereoVariationProgram {
    public readonly type = 0x44_00;
    protected readonly preset: XGVariationPreset = {
        words: [
            512, 0, 0, 256, 0, 0, 0, 0, 0, 0, 0, 512, 683, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 683, 0, 0, 0, 341, 0, 0, 0, 0, 341, 256, 1023, 927, 960, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0,
            256
        ],
        defaults: [12, 25, 16, 0, 0, 28, 64, 46, 64, 127, 46, 64, 10, 0, 0, 0]
    };
    protected readonly initOrder = [0, 1, 2, 5, 7, 9];
    protected readonly connectionParameters = [9];
    protected readonly ranges = PARAMETER_RANGES;
    // The second LFO phase, the shaping states and the tap modulations (updated every 4 samples)
    private lfoPhase2 = 0;
    private smoothA = 0;
    private smoothB = 0;
    private smoothC = 0;
    private lfoCounter = 0;
    private intA = 0;
    private fracA = 0;
    private intB = 0;
    private fracB = 0;
    private intC = 0;
    private fracC = 0;

    protected render(
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        outputGain: number
    ) {
        const memory = this.memory;
        const mask = this.mask;
        const c = this.coefficients;
        const t = this.taps;
        const tapA = t[0x28],
            tapB = t[0x2d],
            tapC = t[0x33],
            writeL = t[0x3a],
            writeR = t[0x3b];
        const rightToL = c[0xaa],
            rightToR = c[0xad];
        const dryL = c[0xb2] * outputGain,
            wetAL = c[0xb4] * outputGain,
            wetCL = c[0xb5] * outputGain,
            dryR = c[0xb8] * outputGain,
            wetBR = c[0xb9] * outputGain,
            wetCR = c[0xba] * outputGain;
        const {
            lfoStep,
            lfoStep2,
            lfoOffset1,
            lfoOffset2,
            lfoOffset3,
            lfoOffset4,
            lfoOffset5,
            lfoOffset6
        } = this;
        const inL = this.inputLeft;
        const inR = this.inputRight;
        let {
            pointer,
            lfoPhase,
            lfoPhase2,
            lfoCounter,
            smoothA,
            smoothB,
            smoothC,
            intA,
            fracA,
            intB,
            fracB,
            intC,
            fracC
        } = this;
        for (let i = 0; i < sampleCount; i++) {
            if ((lfoCounter++ & 3) === 0) {
                // Truncating float32 math like the original, the smoothing poles are close to 1
                lfoPhase = (lfoPhase + lfoStep) & PHASE_MASK;
                lfoPhase2 = (lfoPhase2 + lfoStep2) & PHASE_MASK;
                const shapeA = chop32(
                    triangle((lfoPhase - lfoOffset1) & PHASE_MASK) *
                        TRIANGLE_SCALE -
                        c[0x6f]
                );
                const shapeB = chop32(
                    triangle((lfoPhase - lfoOffset2) & PHASE_MASK) *
                        TRIANGLE_SCALE -
                        c[0x7a]
                );
                const shapeC = chop32(
                    triangle((lfoPhase - lfoOffset5) & PHASE_MASK) *
                        TRIANGLE_SCALE -
                        c[0x89]
                );
                smoothA = chop32(
                    chop32(shapeA * c[0x72]) + chop32(c[0x71] * smoothA)
                );
                smoothB = chop32(
                    chop32(shapeB * c[0x7c]) + chop32(c[0x7b] * smoothB)
                );
                smoothC = chop32(
                    chop32(shapeC * c[0x8b]) + chop32(c[0x8a] * smoothC)
                );
                // Slow smoothed sweep plus a fast triangle of the second phase
                const vA = chop32(
                    chop32(chop32(smoothA - c[0x73]) * c[0x75]) * 4 +
                        chop32(
                            triangle((lfoPhase2 - lfoOffset3) & PHASE_MASK) *
                                c[0x76]
                        ) *
                            TRIANGLE_SCALE
                );
                const vB = chop32(
                    chop32(chop32(smoothB - c[0x7d]) * c[0x85]) * 4 +
                        chop32(
                            triangle((lfoPhase2 - lfoOffset4) & PHASE_MASK) *
                                c[0x86]
                        ) *
                            TRIANGLE_SCALE
                );
                const vC = chop32(
                    chop32(chop32(smoothC - c[0x8c]) * c[0x95]) * 4 +
                        chop32(
                            triangle((lfoPhase2 - lfoOffset6) & PHASE_MASK) *
                                c[0x96]
                        ) *
                            TRIANGLE_SCALE
                );
                intA = Math.trunc(vA);
                intB = Math.trunc(vB);
                intC = Math.trunc(vC);
                fracA = chop32(vA - intA);
                fracB = chop32(vB - intB);
                fracC = chop32(vC - intC);
            }
            let k = (tapA + pointer + intA) & mask;
            const a = (memory[(k + 1) & mask] - memory[k]) * fracA + memory[k];
            k = (tapB + pointer + intB) & mask;
            const b = (memory[(k + 1) & mask] - memory[k]) * fracB + memory[k];
            k = (tapC + pointer + intC) & mask;
            const s = (memory[(k + 1) & mask] - memory[k]) * fracC + memory[k];
            const l = inL[i];
            const r = inR[i];
            // The right line is written first, so the left line wins if both inputs share an address.
            // Below 44.1 kHz the input addresses 1 and 0 both scale to 0, which would silence the left line.
            // At 44.1 kHz the left line overwrites the same sample one step later, so this matches it.
            memory[(writeR + pointer) & mask] = rightToR * r;
            memory[(writeL + pointer) & mask] = rightToL * r + l;
            outputLeft[i] = dryL * l + a * wetAL + s * wetCL;
            outputRight[i] = dryR * r + b * wetBR + s * wetCR;
            pointer = (pointer - 1) & mask;
        }
        this.pointer = pointer;
        this.lfoPhase = lfoPhase;
        this.lfoPhase2 = lfoPhase2;
        this.lfoCounter = lfoCounter & 3;
        this.smoothA = smoothA;
        this.smoothB = smoothB;
        this.smoothC = smoothC;
        this.intA = intA;
        this.fracA = fracA;
        this.intB = intB;
        this.fracB = fracB;
        this.intC = intC;
        this.fracC = fracC;
    }

    protected override resetState() {
        this.lfoPhase2 = 0;
        this.smoothA = this.smoothB = this.smoothC = 0;
        this.lfoCounter = 0;
        this.intA = this.intB = this.intC = 0;
        this.fracA = this.fracB = this.fracC = 0;
    }

    protected convert(param: number) {
        const p = this.params;
        const w = this.coefficientWords;
        switch (param) {
            case 0: {
                this.lfoRate(p[0]);
                this.shapeSmoothLFO(LIST_SHAPE_A);
                this.shapeSmoothLFO(LIST_SHAPE_B);
                this.shapeSmoothLFO(LIST_SHAPE_C);
                break;
            }
            case 1: {
                // The slow sweep takes 5/4 of the depth, the fast one 3/8
                const slow = this.pitchDepth((p[1] * 5) >> 2);
                const fast = this.pitchDepth((p[1] * 3) >> 3);
                w[0x75] = w[0x85] = w[0x95] = slow;
                w[0x76] = w[0x86] = w[0x96] = fast;
                this.pushCoefficients([0x75, 0x85, 0x95, 0x76, 0x86, 0x96]);
                break;
            }
            case 2: {
                const a = this.addressWords;
                const delay =
                    (this.toAddress100us(DELAY_OFFSET[p[2]]) << 16) >> 16;
                const base = this.signedAddress(0x3a) + delay;
                a[0x28] = base + 1;
                a[0x29] = base + 2;
                a[0x33] = base + 0x41;
                a[0x34] = base + 0x42;
                a[0x2d] = base + 0x81;
                a[0x2e] = base + 0x82;
                this.pushAddresses(LIST_TAPS);
                break;
            }
            case 5:
            case 6: {
                this.designLowEqualizer(p[5], p[6]);
                break;
            }
            case 7:
            case 8: {
                this.designHighEqualizer(p[7], p[8]);
                break;
            }
            case 9: {
                // The system mode is always fully wet, the insertion wet is halved
                const mix = this.mixIndex();
                let wet = PAN_RIGHT[mix];
                if (this.insertion) wet >>= 1;
                w[0xb2] = w[0xb8] = PAN_LEFT[mix];
                w[0xb4] =
                    w[0xb5] =
                    w[0xb9] =
                    w[0xba] =
                        (37 * Math.trunc((wet * 10) / 7)) >> 6;
                this.pushCoefficients(LIST_OUTPUT);
                break;
            }
        }
    }
}
