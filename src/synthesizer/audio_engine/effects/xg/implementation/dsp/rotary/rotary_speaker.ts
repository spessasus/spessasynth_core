import { XGStereoVariationProgram } from "../xg_stereo_variation_program";
import {
    chop32,
    PHASE_MASK,
    triangle,
    TRIANGLE_SCALE,
    type XGParameterRanges
} from "../xg_dsp_program";
import { type XGVariationPreset } from "../xg_variation_program";
import { PAN_LEFT, PAN_RIGHT } from "../xg_dsp_tables";

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
const LIST_SHAPE_D = [0x90, 0x8f, 0x8e, 0x91];
const LIST_OUTPUT = [0xb2, 0xb4, 0xb5, 0xb8, 0xb9, 0xbb, 0xb6, 0xba];

/**
 * ROTARY SPEAKER (`45 00`): four delay taps of a mono line with pitch modulation.
 * Three taps (amplitude modulated too) follow the first LFO phase, the fourth follows the second phase.
 */
export class XGRotarySpeaker extends XGStereoVariationProgram {
    public readonly type = 0x45_00;
    protected readonly preset: XGVariationPreset = {
        words: [
            256, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 512, 683, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 341, 0, 0, 0, 0, 768, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 0,
            0, 0, 2, 3, 0, 0, 0, 0, 2, 3, 0, 0, 0, 2, 3, 1, 0, 0, 0, 256
        ],
        defaults: [81, 35, 0, 0, 0, 24, 60, 45, 54, 127, 33, 52, 30, 0, 0, 0]
    };
    protected readonly initOrder = [0, 1, 5, 7, 9];
    protected readonly connectionParameters = [5, 9];
    protected readonly ranges = PARAMETER_RANGES;
    // The second LFO phase, the shaping states, the tap modulations and gains (updated every 4 samples)
    private lfoPhase2 = 0;
    private smoothA = 0;
    private smoothB = 0;
    private smoothC = 0;
    private smoothD = 0;
    private lfoCounter = 0;
    private intA = 0;
    private fracA = 0;
    private intB = 0;
    private fracB = 0;
    private intC = 0;
    private fracC = 0;
    private intD = 0;
    private fracD = 0;
    private ampA = 1;
    private ampB = 1;
    private ampC = 1;

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
            tapD = t[0x38],
            writeL = t[0x3a],
            writeR = t[0x3b];
        const rightToL = c[0xaa],
            rightToR = c[0xad];
        const dryL = c[0xb2] * outputGain,
            wetAL = c[0xb4] * outputGain,
            wetCL = c[0xb5] * outputGain,
            wetDL = c[0xb6] * outputGain,
            dryR = c[0xb8] * outputGain,
            wetBR = c[0xb9] * outputGain,
            wetCR = c[0xba] * outputGain,
            wetDR = c[0xbb] * outputGain;
        const {
            lfoStep,
            lfoStep2,
            lfoOffset1,
            lfoOffset2,
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
            smoothD,
            intA,
            fracA,
            intB,
            fracB,
            intC,
            fracC,
            intD,
            fracD,
            ampA,
            ampB,
            ampC
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
                const shapeD = chop32(
                    triangle((lfoPhase2 - lfoOffset6) & PHASE_MASK) *
                        TRIANGLE_SCALE -
                        c[0x8e]
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
                smoothD = chop32(
                    chop32(shapeD * c[0x90]) + chop32(c[0x8f] * smoothD)
                );
                const xA = chop32(smoothA - c[0x73]) * 4;
                const xB = chop32(smoothB - c[0x7d]) * 4;
                const xC = chop32(smoothC - c[0x8c]) * 4;
                const xD = chop32(smoothD - c[0x91]) * 4;
                const vA = chop32(xA * c[0x75]);
                const vB = chop32(xB * c[0x85]);
                const vC = chop32(xC * c[0x95]);
                const vD = chop32(xD * c[0xa5]);
                ampA = chop32(chop32(xA * c[0x83]) + 1);
                ampB = chop32(chop32(xB * c[0x94]) + 1);
                ampC = chop32(chop32(xC * c[0xa4]) + 1);
                intA = Math.trunc(vA);
                intB = Math.trunc(vB);
                intC = Math.trunc(vC);
                intD = Math.trunc(vD);
                fracA = chop32(vA - intA);
                fracB = chop32(vB - intB);
                fracC = chop32(vC - intC);
                fracD = chop32(vD - intD);
            }
            let k = (tapA + pointer + intA) & mask;
            const a =
                ((memory[(k + 1) & mask] - memory[k]) * fracA + memory[k]) *
                ampA;
            k = (tapB + pointer + intB) & mask;
            const b =
                ((memory[(k + 1) & mask] - memory[k]) * fracB + memory[k]) *
                ampB;
            k = (tapC + pointer + intC) & mask;
            const s =
                ((memory[(k + 1) & mask] - memory[k]) * fracC + memory[k]) *
                ampC;
            k = (tapD + pointer + intD) & mask;
            const d = (memory[(k + 1) & mask] - memory[k]) * fracD + memory[k];
            const l = inL[i];
            const r = inR[i];
            memory[(writeL + pointer) & mask] = rightToL * r + l;
            memory[(writeR + pointer) & mask] = rightToR * r;
            outputLeft[i] = dryL * l + a * wetAL + s * wetCL + d * wetDL;
            outputRight[i] = dryR * r + b * wetBR + s * wetCR + d * wetDR;
            pointer = (pointer - 1) & mask;
        }
        this.pointer = pointer;
        this.lfoPhase = lfoPhase;
        this.lfoPhase2 = lfoPhase2;
        this.lfoCounter = lfoCounter & 3;
        this.smoothA = smoothA;
        this.smoothB = smoothB;
        this.smoothC = smoothC;
        this.smoothD = smoothD;
        this.intA = intA;
        this.fracA = fracA;
        this.intB = intB;
        this.fracB = fracB;
        this.intC = intC;
        this.fracC = fracC;
        this.intD = intD;
        this.fracD = fracD;
        this.ampA = ampA;
        this.ampB = ampB;
        this.ampC = ampC;
    }

    protected override resetState() {
        this.lfoPhase2 = 0;
        this.smoothA = this.smoothB = this.smoothC = this.smoothD = 0;
        this.lfoCounter = 0;
        this.intA = this.intB = this.intC = this.intD = 0;
        this.fracA = this.fracB = this.fracC = this.fracD = 0;
        this.ampA = this.ampB = this.ampC = 1;
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
                this.shapeSmoothLFO(LIST_SHAPE_D, true);
                break;
            }
            case 1: {
                // The amplitude depth saturates from 32 up, the pitch depth is half the value
                const amplitude = this.amplitudeDepth(
                    p[1] < 0x20 ? p[1] << 2 : 0x7f
                );
                const pitch = this.pitchDepth(p[1] >> 1);
                w[0x83] = w[0x94] = w[0xa4] = amplitude;
                w[0x75] = w[0x85] = w[0x95] = w[0xa5] = pitch;
                this.pushCoefficients([
                    0x83, 0x94, 0xa4, 0x75, 0x85, 0x95, 0xa5
                ]);
                break;
            }
            case 5:
            case 6: {
                // The +3 dB low shelf applies in the system mode
                this.designLowEqualizer(p[5], p[6], !this.insertion);
                break;
            }
            case 7:
            case 8: {
                this.designHighEqualizer(p[7], p[8]);
                break;
            }
            case 9: {
                // The system mode is always fully wet, the insertion wet is at 70%
                const mix = this.mixIndex();
                let wet = PAN_RIGHT[mix];
                if (this.insertion) wet = Math.trunc((wet * 7) / 10);
                w[0xb2] = w[0xb8] = PAN_LEFT[mix];
                w[0xb4] = w[0xb5] = w[0xb6] = (56 * wet) >> 6;
                w[0xb9] = w[0xba] = w[0xbb] = (56 * wet) >> 6;
                this.pushCoefficients(LIST_OUTPUT);
                break;
            }
        }
    }
}
