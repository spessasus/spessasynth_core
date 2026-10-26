import { type XGParameterRanges } from "../xg_dsp_program";
import type { XGVariationPreset } from "../xg_variation_program";
import { PAN_LEFT, PAN_RIGHT } from "../xg_dsp_tables";
import { XGPhaserBase } from "./xg_phaser";

const PARAMETER_RANGES: XGParameterRanges = {
    3: [1, 127],
    5: [8, 40],
    6: [52, 76],
    7: [28, 58],
    8: [52, 76],
    10: [6, 10]
};

/**
 * The converter index of the input mix level, which depends on the connection.
 */
const INPUT_MIX = 16;

/**
 * Stage words (0x7b-0x7e, 0x80) and whether the left output takes the fourth stage of the right chain,
 * per stage parameter (6 and lower, 7, 8, 9, 10).
 */
const STAGES = [
    [0x2_00, 0, 0, 0x2_00, 0, false],
    [0, 0x2_00, 0, 0x2_00, 0, false],
    [0, 0, 0x2_00, 0x2_00, 0, false],
    [0, 0x2_00, 0, 0, 0x2_00, true],
    [0, 0, 0x2_00, 0, 0x2_00, true]
] as const;

/**
 * PHASER 1 (`48 00`): a mono-input phaser with 6 to 10 stages.
 */
export class XGPhaser1 extends XGPhaserBase {
    public readonly type = 0x48_00;
    protected readonly preset: XGVariationPreset = {
        words: [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 256, 256, 0, 0, 0, 512, 512, 0, 0, 512, 512, 0, 0, 512, 512, 0,
            0, 512, 512, 0, 0, 512, 512, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0,
            0, 0, 512, 512, 0, 0, 512, 512, 0, 0, 512, 512, 0, 0, 512, 512, 0,
            0, 512, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 256
        ],
        defaults: [8, 111, 74, 104, 0, 28, 64, 46, 64, 64, 6, 1, 64, 0, 0, 0]
    };

    protected readonly initOrder = [0, 1, 3, 5, 7, 9, 10, INPUT_MIX];

    protected readonly connectionParameters = [9, INPUT_MIX];

    protected readonly ranges = PARAMETER_RANGES;

    protected convert(param: number) {
        const p = this.params;
        const w = this.coefficientWords;
        const mix = this.mixIndex();
        switch (param) {
            case 0: {
                this.sweepRate();
                break;
            }
            case 1:
            case 2: {
                this.sweepDepth(0x2_00);
                break;
            }
            case 3: {
                w[0x87] = this.feedbackWord(p[3]);
                this.pushCoefficients([0x87]);
                break;
            }
            case 5:
            case 6: {
                this.lowEqualizer();
                break;
            }
            case 7:
            case 8: {
                this.highEqualizer();
                break;
            }
            case 9: {
                w[0xa6] = w[0xa2] = PAN_LEFT[mix];
                w[0xa7] = PAN_RIGHT[mix];
                this.pushCoefficients([0xa2]);
                this.pushCoefficients([0xa6, 0xa7]);
                if (p[10] < 9) {
                    w[0xa4] = PAN_RIGHT[mix];
                    this.pushCoefficients([0xa4]);
                } else {
                    w[0xa5] = PAN_RIGHT[mix];
                    this.pushCoefficients([0xa5]);
                }
                break;
            }
            case 10: {
                const stage = STAGES[Math.max(0, Math.min(10, p[10]) - 6)];
                w[0x7b] = stage[0];
                w[0x7c] = stage[1];
                w[0x7d] = stage[2];
                w[0x7e] = stage[3];
                w[0x80] = stage[4];
                // The left output takes the second or the fourth stage of the right chain
                w[0xa4] = stage[5] ? 0 : PAN_RIGHT[mix];
                w[0xa5] = stage[5] ? PAN_RIGHT[mix] : 0;
                this.pushCoefficients([0x7b, 0x7c, 0x7d, 0x7e]);
                this.pushCoefficients([0x80]);
                this.pushCoefficients([0xa4, 0xa5]);
                break;
            }
            case INPUT_MIX: {
                // L+R in the system mode, their average in the insertion mode
                w[0x84] = w[0x85] = this.insertion ? 0x1_00 : 0x2_00;
                this.pushCoefficients([0x84, 0x85]);
                break;
            }
        }
    }
}
