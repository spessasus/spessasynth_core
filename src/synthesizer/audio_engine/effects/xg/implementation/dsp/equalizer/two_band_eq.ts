import { XGStereoVariationProgram } from "../xg_stereo_variation_program";
import { type XGParameterRanges } from "../xg_dsp_program";
import { type XGVariationPreset } from "../xg_variation_program";

const PARAMETER_RANGES: XGParameterRanges = {
    0: [8, 40],
    1: [52, 76],
    2: [28, 58],
    3: [52, 76]
};

/**
 * 2-BAND EQ (`4D 00`): a stereo low and high shelf.
 * The original routine is only the variation input EQ, so the output is the EQ'd input.
 */
export class XGTwoBandEQ extends XGStereoVariationProgram {
    public static override readonly memorySize = 0;
    public readonly type = 0x4d_00;
    protected readonly preset: XGVariationPreset = {
        words: [
            128, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            128, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 256
        ],
        defaults: [28, 70, 46, 70, 0, 0, 0, 0, 0, 127, 34, 64, 10, 0, 0, 0]
    };
    protected readonly initOrder = [0, 2];
    protected readonly connectionParameters = [];
    protected readonly ranges = PARAMETER_RANGES;

    protected render(
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        outputGain: number
    ) {
        const inL = this.inputLeft;
        const inR = this.inputRight;
        for (let i = 0; i < sampleCount; i++) {
            outputLeft[i] = inL[i] * outputGain;
            outputRight[i] = inR[i] * outputGain;
        }
    }

    protected convert(param: number) {
        const p = this.params;
        switch (param) {
            case 0:
            case 1: {
                this.designLowEqualizer(p[0], p[1]);
                break;
            }
            case 2:
            case 3: {
                this.designHighEqualizer(p[2], p[3]);
                break;
            }
        }
    }
}
