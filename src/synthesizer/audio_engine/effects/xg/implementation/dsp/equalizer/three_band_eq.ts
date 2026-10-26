import { type XGParameterRanges } from "../xg_dsp_program";
import type { XGVariationPreset } from "../xg_variation_program";
import {
    LIST_LOW_A,
    LIST_LOW_B,
    XGMonoVariationProgram
} from "../xg_mono_variation_program";

const PARAMETER_RANGES: XGParameterRanges = {
    0: [52, 76],
    1: [28, 54],
    2: [52, 76],
    3: [10, 120],
    4: [52, 76],
    5: [8, 40],
    6: [28, 58]
};

// High shelf push lists (b0, b1, a1) and the mid peaking push list (b0, b1, b2, a1, a2)
const LIST_HIGH_A = [0xa3, 0xa2, 0xa4];
const LIST_HIGH_B = [0xab, 0xaa, 0xac];
const LIST_MID = [0xa9, 0xa8, 0xa7, 0xa6, 0xa5];

/**
 * The converter index of the mono input level, which depends on the connection.
 */
const MONO_INPUT = 16;

/**
 * 3-BAND EQ (`4C 00`): a mono low shelf, mid peaking EQ and high shelf.
 * Each shelf is split into two cascaded sections of half the gain.
 */
export class XGThreeBandEQ extends XGMonoVariationProgram {
    public static override readonly memorySize = 0;
    public readonly type = 0x4c_00;
    protected readonly preset: XGVariationPreset = {
        words: [
            256, 256, 0, 0, 0, 0, 0, 0, 0, 128, 0, 0, 0, 128, 0, 0, 128, 0, 0,
            128, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 512, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 256, 0,
            0
        ],
        defaults: [70, 34, 60, 10, 70, 28, 46, 0, 0, 127, 0, 0, 0, 0, 0, 0]
    };
    protected readonly initOrder = [0, 1, 4, MONO_INPUT];
    protected readonly connectionParameters = [MONO_INPUT];
    protected readonly ranges = PARAMETER_RANGES;

    protected render(
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        outputGain: number
    ) {
        this.mixMono(sampleCount);
        this.filterOutput(this.mono, sampleCount);
        this.mixOutput(
            this.mono,
            outputLeft,
            outputRight,
            sampleCount,
            outputGain
        );
    }

    protected convert(param: number) {
        const p = this.params;
        switch (param) {
            case 0:
            case 5: {
                // The gain is split between the two sections
                const half = Math.trunc((p[0] - 0x40) / 2);
                this.designFirstOrder(
                    "lowShelf",
                    p[5],
                    half + 0x40,
                    LIST_LOW_A
                );
                this.designFirstOrder(
                    "lowShelf",
                    p[5],
                    p[0] - half,
                    LIST_LOW_B
                );
                break;
            }
            case 1:
            case 2:
            case 3: {
                this.designSecondOrder("peaking", p[1], p[2], p[3], LIST_MID);
                break;
            }
            case 4:
            case 6: {
                const half = Math.trunc((p[4] - 0x40) / 2);
                this.designFirstOrder(
                    "highShelf",
                    p[6],
                    half + 0x40,
                    LIST_HIGH_A
                );
                this.designFirstOrder(
                    "highShelf",
                    p[6],
                    p[4] - half,
                    LIST_HIGH_B
                );
                break;
            }
            case MONO_INPUT: {
                this.monoInputLevel();
                break;
            }
        }
    }
}
