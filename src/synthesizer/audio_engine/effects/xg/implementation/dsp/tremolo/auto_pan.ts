import { type XGParameterRanges } from "../xg_dsp_program";
import type { XGVariationPreset } from "../xg_variation_program";
import { LIST_SHAPE_LEFT, LIST_SHAPE_RIGHT, XGTremoloBase } from "./xg_tremolo";

const PARAMETER_RANGES: XGParameterRanges = {
    3: [0, 5],
    5: [8, 40],
    6: [52, 76],
    7: [28, 58],
    8: [52, 76]
};

/**
 * LFO phases (left, right) per pan direction: L<->R, L->R, L<-R, L turn, R turn.
 */
const DIRECTION_PHASES = [
    [0x40, 0x7c],
    [0x54, 0x40],
    [0x40, 0x54],
    [0x5e, 0x40],
    [0x40, 0x5e]
];

/**
 * AUTO PAN (`47 00`): moves the sound between the sides (and front/back with pitch modulation).
 */
export class XGAutoPan extends XGTremoloBase {
    public readonly type = 0x47_00;
    protected readonly variationGain = 45;
    protected readonly preset: XGVariationPreset = {
        words: [
            0, 0, 0, 0, 0, 0, 0, 1008, 0, 512, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 1008, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 256, 0, 0, 0, 0, 256, 0, 0, 0, 0, 0, 0, 2,
            3, 0, 0, 0, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 256
        ],
        defaults: [76, 80, 32, 5, 0, 28, 64, 46, 64, 127, 40, 64, 10, 0, 0, 0]
    };

    protected readonly initOrder = [0, 3, 5, 7];

    protected readonly connectionParameters = [9];

    protected readonly ranges = PARAMETER_RANGES;

    protected convert(param: number) {
        const p = this.params;
        const w = this.coefficientWords;
        switch (param) {
            case 0: {
                this.lfoRate(p[0]);
                if (p[3] <= 4) {
                    this.shapeLFO(LIST_SHAPE_LEFT);
                    this.shapeLFO(LIST_SHAPE_RIGHT);
                }
                break;
            }
            case 1: {
                // The L/R direction inverts the depth
                w[0x83] = w[0x94] = this.amplitudeDepth(
                    p[3] < 5 ? p[1] : -p[1]
                );
                this.pushCoefficients([0x83, 0x94]);
                break;
            }
            case 2: {
                // Front/back depth only for the turning directions
                w[0x75] = w[0x85] = this.pitchDepth(
                    p[3] === 3 || p[3] === 4 ? p[2] >> 2 : 0
                );
                this.pushCoefficients([0x75, 0x85]);
                break;
            }
            case 3: {
                if (p[3] > 4) {
                    // L/R: a hard square-like switch
                    w[0x6e] = this.phaseWord(0x40);
                    w[0x79] = this.phaseWord(0x7c);
                    w[0x71] = w[0x72] = w[0x7b] = w[0x7c] = 0x3_ff;
                    w[0x6f] = w[0x7a] = 0x3_40;
                    w[0x73] = w[0x7d] = 0x2_00;
                    this.pushCoefficients([0x6e, 0x79]);
                    this.pushCoefficients(LIST_SHAPE_LEFT);
                    this.pushCoefficients(LIST_SHAPE_RIGHT);
                } else {
                    const [left, right] = DIRECTION_PHASES[p[3]];
                    w[0x6e] = this.phaseWord(left);
                    w[0x79] = this.phaseWord(right);
                    this.pushCoefficients([0x6e, 0x79]);
                    this.shapeLFO(LIST_SHAPE_LEFT);
                    this.shapeLFO(LIST_SHAPE_RIGHT);
                }
                this.convert(1);
                this.convert(2);
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
                // Not a parameter in the original: the output level follows the connection
                w[0xb9] = w[0xb4] = this.outputWord(
                    this.insertion ? 0x1_6a : 0x2_d4
                );
                this.pushCoefficients([0xb4, 0xb9]);
                break;
            }
        }
    }
}
