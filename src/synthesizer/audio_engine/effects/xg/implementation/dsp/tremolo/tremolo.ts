import { type XGParameterRanges } from "../xg_dsp_program";
import type { XGVariationPreset } from "../xg_variation_program";
import { LIST_SHAPE_LEFT, LIST_SHAPE_RIGHT, XGTremoloBase } from "./xg_tremolo";

const PARAMETER_RANGES: XGParameterRanges = {
    5: [8, 40],
    6: [52, 76],
    7: [28, 58],
    8: [52, 76],
    13: [4, 124],
    14: [0, 1]
};

/**
 * TREMOLO (`46 00`): amplitude and pitch modulation.
 */
export class XGTremolo extends XGTremoloBase {
    public readonly type = 0x46_00;
    protected readonly variationGain = 56;
    protected readonly preset: XGVariationPreset = {
        words: [
            0, 0, 0, 0, 0, 0, 0, 1008, 0, 512, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 1008, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            512, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 2, 3,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 256
        ],
        defaults: [83, 56, 0, 0, 0, 28, 64, 46, 64, 127, 40, 64, 10, 64, 0, 0]
    };

    protected readonly initOrder = [0, 1, 2, 13, 14];

    protected readonly connectionParameters = [14];

    protected readonly ranges = PARAMETER_RANGES;

    protected convert(param: number) {
        const p = this.params;
        const w = this.coefficientWords;
        switch (param) {
            case 0: {
                this.lfoRate(p[0]);
                this.shapeLFO(LIST_SHAPE_LEFT);
                this.shapeLFO(LIST_SHAPE_RIGHT);
                break;
            }
            case 1: {
                w[0x83] = w[0x94] = this.amplitudeDepth(p[1]);
                this.pushCoefficients([0x83, 0x94]);
                break;
            }
            case 2: {
                w[0x75] = w[0x85] = this.pitchDepth(p[2] >> 2);
                this.pushCoefficients([0x75, 0x85]);
                break;
            }
            case 5:
            case 6: {
                // The +3 dB low shelf applies in the system mode or with the stereo input
                this.designLowEqualizer(
                    p[5],
                    p[6],
                    !this.insertion || p[14] !== 0
                );
                break;
            }
            case 7:
            case 8: {
                this.designHighEqualizer(p[7], p[8]);
                break;
            }
            case 13: {
                w[0x79] = this.phaseWord(p[13]);
                this.pushCoefficients([0x79]);
                break;
            }
            case 14: {
                const a = this.addressWords;
                if (p[14] === 0) {
                    w[0xaa] = 0x2_00;
                    w[0xb9] = w[0xb4] = this.outputWord(
                        this.insertion ? 0x1_6a : 0x2_00
                    );
                    a[0x3b] = 0;
                    a[0x2d] = this.signedAddress(0x3a) + 1;
                    a[0x2e] = this.signedAddress(0x3a) + 2;
                } else {
                    // Stereo: the right line starts at 1024
                    w[0xaa] = 0;
                    w[0xb9] = w[0xb4] = this.outputWord(0x2_00);
                    a[0x3b] = 0x4_00;
                    a[0x2d] = 0x4_01;
                    a[0x2e] = 0x4_02;
                }
                this.pushCoefficients([0xaa, 0xb4, 0xb9]);
                this.pushAddresses([0x3b, 0x2d, 0x2e]);
                this.convert(5);
                this.convert(7);
                break;
            }
        }
    }
}
