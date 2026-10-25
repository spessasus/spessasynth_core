import { MIX_DRY, MIX_WET } from "../xg_dsp_tables";
import { type XGParameterRanges } from "../xg_dsp_program";
import type { XGVariationPreset } from "../xg_variation_program";
import {
    LEFT_BASE,
    LIST_DAMP_A,
    LIST_DAMP_B,
    RIGHT_BASE,
    RIGHT_LINE_START,
    XGDelayBase
} from "./xg_delay";

const PARAMETER_RANGES: XGParameterRanges = {
    0: [1, 3550],
    1: [1, 3550],
    2: [1, 127],
    3: [0, 2],
    4: [1, 10],
    9: [1, 127],
    12: [8, 40],
    13: [52, 76],
    14: [28, 58],
    15: [52, 76]
};

/**
 * CROSS DELAY (`08 00`): two delay lines feeding back into each other.
 */
export class XGCrossDelay extends XGDelayBase {
    public readonly type = 0x08_00;
    protected readonly preset: XGVariationPreset = {
        words: [
            128, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 256
        ],
        defaults: [
            1700, 1750, 111, 1, 10, 0, 0, 0, 0, 32, 0, 60, 28, 64, 46, 64
        ]
    };

    protected readonly initOrder = [3, 0, 1, 4, 12, 14];

    protected readonly ranges = PARAMETER_RANGES;

    protected convert(param: number) {
        const p = this.params;
        const w = this.coefficientWords;
        // Input select: 0 L, 1 R (the lines swap), 2 L&R
        const swapped = p[3] === 1;
        switch (param) {
            case 0: {
                this.placeTap(0x2d, p[0], swapped ? RIGHT_BASE : LEFT_BASE);
                break;
            }
            case 1: {
                this.placeTap(0x28, p[1], swapped ? LEFT_BASE : RIGHT_BASE);
                break;
            }
            case 2: {
                const level = this.feedbackWord(p[2]);
                w[0xaf] = w[0xab] = swapped ? 0 : level;
                w[0xae] = w[0xac] = swapped ? level : 0;
                this.pushCoefficients([0xab, 0xaf, 0xac, 0xae]);
                break;
            }
            case 3: {
                const separate = p[3] === 2;
                w[0xaa] = separate ? 0 : 0x2_00;
                w[0xad] = separate ? 0x2_00 : 0;
                const a = this.addressWords;
                a[LEFT_BASE] = swapped ? RIGHT_LINE_START : 1;
                a[RIGHT_BASE] = swapped ? 1 : RIGHT_LINE_START;
                this.pushCoefficients([0xaa, 0xad]);
                this.pushAddresses([LEFT_BASE, RIGHT_BASE]);
                this.convert(0);
                this.convert(1);
                this.convert(2);
                this.convert(9);
                break;
            }
            case 4: {
                this.designDamping(p[4], LIST_DAMP_A);
                this.designDamping(p[4], LIST_DAMP_B);
                break;
            }
            case 9: {
                const mix = this.mixIndex();
                w[0xb8] = w[0xb2] = MIX_DRY[mix] & 0x3_ff;
                let wet = MIX_WET[mix];
                if (p[3] < 2) wet >>= 1;
                w[0xb9] = w[0xb4] = wet & 0x3_ff;
                this.pushCoefficients([0xb2, 0xb4, 0xb8, 0xb9]);
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
