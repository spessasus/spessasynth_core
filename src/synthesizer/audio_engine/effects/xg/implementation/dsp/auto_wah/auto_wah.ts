import { XGFilterVariationProgram } from "../xg_filter_variation_program";
import {
    chop32,
    PHASE_MASK,
    triangle,
    type XGParameterRanges
} from "../xg_dsp_program";
import { type XGVariationPreset } from "../xg_variation_program";
import { LFO_RATE, PAN_LEFT, PAN_RIGHT } from "../xg_dsp_tables";
import { CUTOFF_OFFSET } from "./auto_wah_tables";

const PARAMETER_RANGES: XGParameterRanges = {
    3: [10, 120],
    5: [8, 40],
    6: [52, 76],
    7: [28, 58],
    8: [52, 76]
};

// Input EQ push lists (b0, b1, a1): low and high shelves of the right and left sides
const LIST_LOW_RIGHT = [0x70, 0x6f, 0x71];
const LIST_LOW_LEFT = [0x81, 0x80, 0x82];
const LIST_HIGH_RIGHT = [0x73, 0x72, 0x74];
const LIST_HIGH_LEFT = [0x84, 0x83, 0x85];

/**
 * AUTO WAH (`4E 00`): a resonant filter per side, swept by an exponential LFO.
 */
export class XGAutoWah extends XGFilterVariationProgram {
    public static override readonly memorySize = 0;
    public readonly type = 0x4e_00;
    protected readonly preset: XGVariationPreset = {
        words: [
            0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0, 0,
            0, 0, 0, 0, 0, 0, 128, 0, 513, 512, 0, 512, 0, 0, 0, 0, 0, 0, 0,
            128, 0, 513, 512, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 256, 0, 0,
            0
        ],
        defaults: [70, 56, 39, 25, 0, 28, 66, 46, 64, 127, 0, 0, 0, 0, 0, 0]
    };
    protected readonly initOrder = [0, 1, 3, 5, 7, 9];
    protected readonly connectionParameters = [9];
    protected readonly ranges = PARAMETER_RANGES;
    // Input EQ states (two first-order sections per side)
    private eqXL = 0;
    private eqYL = 0;
    private eqZL = 0;
    private eqXR = 0;
    private eqYR = 0;
    private eqZR = 0;
    // Wah filter states and the swept frequency coefficient (updated every 4 samples)
    private bandL = 0;
    private lowL = 0;
    private bandR = 0;
    private lowR = 0;
    private frequency = 0;
    private lfoCounter = 0;

    protected render(
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        outputGain: number
    ) {
        const c = this.coefficients;
        const inL = this.inputLeft;
        const inR = this.inputRight;
        const lb0L = c[0x81],
            lb1L = c[0x80],
            la1L = c[0x82],
            hb0L = c[0x84],
            hb1L = c[0x83],
            ha1L = c[0x85],
            lb0R = c[0x70],
            lb1R = c[0x6f],
            la1R = c[0x71],
            hb0R = c[0x73],
            hb1R = c[0x72],
            ha1R = c[0x74];
        const dryLeftGain = c[0xb9],
            dryRightGain = c[0xab],
            leftGain = c[0x88],
            leftToRight = c[0x94],
            rightGain = c[0x95];
        const depth = c[0x86],
            offset = c[0x87],
            scale = c[0xbf];
        const resonanceL = c[0x89],
            lowInL = c[0x8a],
            keepL = c[0x8b],
            lowFbL = c[0x8d],
            resonanceR = c[0x96],
            lowInR = c[0x97],
            keepR = c[0x98],
            lowFbR = c[0x9a];
        const outL = c[0xba],
            outR = c[0xad];
        const step = this.wahStep;
        let { eqXL, eqYL, eqZL, eqXR, eqYR, eqZR } = this;
        let { bandL, lowL, bandR, lowR, frequency, lfoCounter, lfoPhase } =
            this;
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
            const wetInL = leftGain * left;
            const wetInR = leftToRight * left + rightGain * right;

            if ((lfoCounter++ & 3) === 0) {
                // Exponential sweep: 2^v with the integer part as a shift
                lfoPhase = (lfoPhase + step) & PHASE_MASK;
                const v = chop32(chop32(triangle(lfoPhase) * depth) - offset);
                const n = Math.trunc(v);
                frequency = chop32(
                    chop32(v - n + 1) * chop32((1 << (n & 0x1f)) * scale)
                );
                frequency = Math.max(-1, Math.min(1, frequency));
            }

            // Resonant filters (state variable form)
            bandL = Math.fround(
                keepL * bandL +
                    (lowInL * lowL + resonanceL * bandL + wetInL) * frequency
            );
            lowL = Math.fround(frequency * bandL + lowFbL * lowL);
            bandR = Math.fround(
                keepR * bandR +
                    (resonanceR * bandR + lowInR * lowR + wetInR) * frequency
            );
            lowR = Math.fround(frequency * bandR + lowFbR * lowR);

            outputLeft[i] = (outL * bandL + dryLeftGain * left) * outputGain;
            outputRight[i] = (outR * bandR + dryRightGain * right) * outputGain;
        }
        this.eqXL = eqXL;
        this.eqYL = eqYL;
        this.eqZL = eqZL;
        this.eqXR = eqXR;
        this.eqYR = eqYR;
        this.eqZR = eqZR;
        this.bandL = bandL;
        this.lowL = lowL;
        this.bandR = bandR;
        this.lowR = lowR;
        this.frequency = frequency;
        this.lfoCounter = lfoCounter & 3;
        this.lfoPhase = lfoPhase;
    }

    protected override resetState() {
        this.eqXL = this.eqYL = this.eqZL = 0;
        this.eqXR = this.eqYR = this.eqZR = 0;
        this.bandL = this.lowL = this.bandR = this.lowR = 0;
        this.frequency = 0;
        this.lfoCounter = 0;
    }

    protected convert(param: number) {
        const p = this.params;
        const w = this.coefficientWords;
        switch (param) {
            case 0: {
                w[0x7e] = LFO_RATE[p[0]];
                this.pushCoefficients([0x7e]);
                break;
            }
            case 1:
            case 2: {
                // The cutoff offset, and the depth relative to it
                const cutoff = CUTOFF_OFFSET[p[2]];
                w[0x87] = cutoff;
                w[0x86] = Math.trunc(
                    (((cutoff - 0x2_00) & 0x3_ff) * p[1]) / 0x7f
                );
                this.pushCoefficients([0x87]);
                this.pushCoefficients([0x86]);
                break;
            }
            case 3: {
                // Resonance
                w[0x96] = w[0x89] =
                    p[3] < 11
                        ? 0x2_01
                        : Math.trunc(Math.fround(-5120 / p[3])) & 0x3_ff;
                this.pushCoefficients([0x89, 0x96]);
                break;
            }
            case 5:
            case 6: {
                this.designFirstOrder("lowShelf", p[5], p[6], LIST_LOW_RIGHT);
                this.designFirstOrder("lowShelf", p[5], p[6], LIST_LOW_LEFT);
                break;
            }
            case 7:
            case 8: {
                this.designFirstOrder("highShelf", p[7], p[8], LIST_HIGH_RIGHT);
                this.designFirstOrder("highShelf", p[7], p[8], LIST_HIGH_LEFT);
                break;
            }
            case 9: {
                // The system mode is always fully wet
                const mix = this.mixIndex();
                w[0xab] = w[0xb9] = PAN_LEFT[mix];
                w[0xad] = w[0xba] = PAN_RIGHT[mix];
                this.pushCoefficients([0xb9, 0xba]);
                this.pushCoefficients([0xab, 0xad]);
                break;
            }
        }
    }
}
