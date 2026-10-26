import { MIX_DRY, MIX_WET } from "../xg_dsp_tables";
import { type XGParameterRanges } from "../xg_dsp_program";
import type { XGVariationPreset } from "../xg_variation_program";
import { LEFT_BASE, LIST_DAMP_A, LIST_DAMP_B, XGDelayBase } from "./xg_delay";

const PARAMETER_RANGES: XGParameterRanges = {
    0: [1, 7150],
    1: [1, 7150],
    2: [1, 7150],
    3: [1, 7150],
    4: [1, 127],
    5: [1, 10],
    9: [1, 127],
    12: [8, 40],
    13: [52, 76],
    14: [28, 58],
    15: [52, 76]
};

/**
 * DELAY L,R (`06 00`): left and right taps with two feedback taps.
 */
export class XGDelayLR extends XGDelayBase {
    public readonly type = 0x06_00;
    protected readonly preset: XGVariationPreset = {
        words: [
            128, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 256
        ],
        defaults: [
            2500, 3750, 3752, 3750, 87, 10, 0, 0, 0, 32, 0, 60, 28, 64, 46, 64
        ]
    };

    protected readonly initOrder = [0, 1, 2, 3, 4, 5, 9, 12, 14];

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
                this.placeTap(0x38, p[1], LEFT_BASE);
                break;
            }
            case 2: {
                this.placeTap(0x28, p[2], LEFT_BASE);
                break;
            }
            case 3: {
                this.placeTap(0x2d, p[3], LEFT_BASE);
                break;
            }
            case 4: {
                // Two feedback taps, half level each
                w[0xac] = w[0xab] = (((p[4] - 0x40) * 0x7d) >> 5) & 0x3_ff;
                this.pushCoefficients([0xab, 0xac]);
                break;
            }
            case 5: {
                this.designDamping(p[5], LIST_DAMP_A);
                this.designDamping(p[5], LIST_DAMP_B);
                break;
            }
            case 9: {
                const mix = this.mixIndex();
                w[0xb8] = w[0xb2] = MIX_DRY[mix] & 0x3_ff;
                let wet = MIX_WET[mix];
                if (this.insertion) wet >>= 1;
                w[0xbb] = w[0xb5] = wet & 0x3_ff;
                this.pushCoefficients([0xb2, 0xb5, 0xb8, 0xbb]);
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
