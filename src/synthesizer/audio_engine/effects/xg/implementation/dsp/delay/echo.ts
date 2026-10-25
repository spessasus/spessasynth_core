import { MIX_DRY, MIX_WET } from "../xg_dsp_tables";
import { type XGParameterRanges } from "../xg_dsp_program";
import type { XGVariationPreset } from "../xg_variation_program";
import { DELAY_LEVEL } from "./delay_tables";
import {
    LEFT_BASE,
    LIST_DAMP_A,
    LIST_DAMP_B,
    RIGHT_BASE,
    XGDelayBase
} from "./xg_delay";

const PARAMETER_RANGES: XGParameterRanges = {
    0: [1, 3550],
    1: [1, 127],
    2: [1, 3550],
    3: [1, 127],
    4: [1, 10],
    5: [1, 3550],
    6: [1, 3550],
    9: [1, 127],
    12: [8, 40],
    13: [52, 76],
    14: [28, 58],
    15: [52, 76]
};

/**
 * ECHO (`07 00`): two independent delay lines with feedback and a second tap each.
 */
export class XGEcho extends XGDelayBase {
    public readonly type = 0x07_00;
    // The right line input sits in the upper half of the memory
    protected readonly preset: XGVariationPreset = {
        words: [
            128, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 16_384, 0, 0, 256
        ],
        defaults: [
            1700, 80, 1780, 80, 10, 1700, 1780, 0, 0, 40, 0, 60, 28, 64, 46, 64
        ]
    };

    protected readonly initOrder = [0, 1, 2, 3, 4, 5, 6, 7, 12, 14];

    protected readonly ranges = PARAMETER_RANGES;

    protected convert(param: number) {
        const p = this.params;
        const w = this.coefficientWords;
        switch (param) {
            case 0: {
                this.placeTap(0x28, p[0], LEFT_BASE);
                break;
            }
            case 1: {
                w[0xab] = this.feedbackWord(p[1]);
                this.pushCoefficients([0xab]);
                break;
            }
            case 2: {
                this.placeTap(0x2d, p[2], RIGHT_BASE);
                break;
            }
            case 3: {
                w[0xaf] = this.feedbackWord(p[3]);
                this.pushCoefficients([0xaf]);
                break;
            }
            case 4: {
                this.designDamping(p[4], LIST_DAMP_A);
                this.designDamping(p[4], LIST_DAMP_B);
                break;
            }
            case 5: {
                this.placeTap(0x33, p[5], LEFT_BASE);
                break;
            }
            case 6: {
                this.placeTap(0x38, p[6], RIGHT_BASE);
                break;
            }
            case 7:
            case 9: {
                const mix = this.mixIndex();
                w[0xb8] = w[0xb2] = MIX_DRY[mix] & 0x3_ff;
                const wet = MIX_WET[mix];
                w[0xb9] = w[0xb4] = wet & 0x3_ff;
                w[0xbb] = w[0xb5] =
                    Math.trunc(wet * DELAY_LEVEL[p[7]]) & 0x3_ff;
                this.pushCoefficients([0xb2, 0xb4, 0xb5, 0xb8, 0xb9, 0xbb]);
                break;
            }
            case 12:
            case 13: {
                this.designLowEqualizer(p[12], p[13]);
                break;
            }
            case 14:
            case 15: {
                this.designHighEqualizer(p[14], p[15]);
                break;
            }
        }
    }
}
