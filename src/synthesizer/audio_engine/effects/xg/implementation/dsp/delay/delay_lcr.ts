import { MIX_DRY, MIX_WET } from "../xg_dsp_tables";
import { type XGParameterRanges } from "../xg_dsp_program";
import type { XGVariationPreset } from "../xg_variation_program";
import { DELAY_LEVEL } from "./delay_tables";
import { LEFT_BASE, LIST_DAMP_A, XGDelayBase } from "./xg_delay";

const PARAMETER_RANGES: XGParameterRanges = {
    0: [1, 7150],
    1: [1, 7150],
    2: [1, 7150],
    3: [1, 7150],
    4: [1, 127],
    6: [1, 10],
    9: [1, 127],
    12: [8, 40],
    13: [52, 76],
    14: [28, 58],
    15: [52, 76]
};

/**
 * DELAY L,C,R (`05 00`): left, right and center taps with a separate feedback tap.
 */
export class XGDelayLCR extends XGDelayBase {
    public readonly type = 0x05_00;
    protected readonly preset: XGVariationPreset = {
        words: [
            128, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 256
        ],
        defaults: [
            3333, 1667, 5000, 5000, 74, 100, 10, 0, 0, 32, 0, 60, 28, 64, 46, 64
        ]
    };

    protected readonly initOrder = [0, 1, 2, 3, 4, 5, 6, 12, 14];

    protected readonly ranges = PARAMETER_RANGES;

    protected convert(param: number) {
        const p = this.params;
        const w = this.coefficientWords;
        switch (param) {
            case 0: {
                this.placeTap(0x33, p[0], LEFT_BASE);
                break;
            }
            case 1: {
                this.placeTap(0x2d, p[1], LEFT_BASE);
                break;
            }
            case 2: {
                this.placeTap(0x38, p[2], LEFT_BASE);
                break;
            }
            case 3: {
                this.placeTap(0x28, p[3], LEFT_BASE);
                break;
            }
            case 4: {
                w[0xab] = this.feedbackWord(p[4]);
                this.pushCoefficients([0xab]);
                break;
            }
            case 5:
            case 9: {
                const mix = this.mixIndex();
                w[0xb8] = w[0xb2] = MIX_DRY[mix] & 0x3_ff;
                let wet = MIX_WET[mix];
                if (this.insertion) wet >>= 1;
                w[0xb9] = w[0xb5] = wet & 0x3_ff;
                w[0xbb] = w[0xb6] =
                    Math.trunc(wet * DELAY_LEVEL[p[5]]) & 0x3_ff;
                this.pushCoefficients([0xb2, 0xb5, 0xb8, 0xb9, 0xbb, 0xb6]);
                break;
            }
            case 6: {
                this.designDamping(p[6], LIST_DAMP_A);
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
