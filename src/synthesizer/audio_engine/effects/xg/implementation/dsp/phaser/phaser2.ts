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
    10: [3, 5],
    12: [4, 124]
};

/**
 * PHASER 2 (`48 08`): a stereo phaser with 3 to 5 stages and an LFO phase difference between the sides.
 */
export class XGPhaser2 extends XGPhaserBase {
    public readonly type = 0x48_08;
    protected readonly preset: XGVariationPreset = {
        words: [
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 512, 0, 0, 0, 0, 512, 512, 0, 0, 512, 512, 0, 0, 512, 512, 0, 0,
            512, 512, 0, 0, 512, 512, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 512, 512, 0, 0, 512, 512, 0, 0, 512, 512, 0, 0, 512, 512, 0, 0,
            512, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 256
        ],
        defaults: [8, 111, 74, 108, 0, 28, 64, 46, 64, 64, 5, 1, 4, 0, 0, 0]
    };

    protected readonly initOrder = [0, 1, 3, 5, 7, 9, 10, 12];

    protected readonly connectionParameters = [9];

    protected readonly ranges = PARAMETER_RANGES;

    protected convert(param: number) {
        const p = this.params;
        const w = this.coefficientWords;
        switch (param) {
            case 0: {
                this.sweepRate();
                break;
            }
            case 1:
            case 2: {
                // The right side sweeps a slightly narrower range
                this.sweepDepth(0x1_e0);
                break;
            }
            case 3: {
                w[0xa1] = w[0x86] = this.feedbackWord(p[3]);
                this.pushCoefficients([0x86, 0xa1]);
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
                const mix = this.mixIndex();
                w[0xa6] = w[0xa2] = PAN_LEFT[mix];
                w[0xa7] = w[0xa3] = PAN_RIGHT[mix];
                this.pushCoefficients([0xa2, 0xa3]);
                this.pushCoefficients([0xa6, 0xa7]);
                break;
            }
            case 10: {
                // Both chains take the third, fourth or fifth stage
                const stage = p[10] < 4 ? 0 : p[10] === 4 ? 1 : 2;
                w[0x7e] = w[0x7b] = stage === 0 ? 0x2_00 : 0;
                w[0x7f] = w[0x7c] = stage === 1 ? 0x2_00 : 0;
                w[0x80] = w[0x7d] = stage === 2 ? 0x2_00 : 0;
                this.pushCoefficients([0x7b, 0x7c, 0x7d, 0x7e, 0x7f, 0x80]);
                break;
            }
            case 12: {
                // LFO phase difference (64 is none)
                w[0x9c] = this.phaseWord(p[12]);
                this.pushCoefficients([0x9c]);
                break;
            }
        }
    }
}
