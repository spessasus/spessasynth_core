import {
    type XGBiquadShape,
    type XGFilterShape,
    type XGParameterRanges
} from "../xg_dsp_program";
import type { XGVariationPreset } from "../xg_variation_program";
import { LIST_LOW_A, LIST_LOW_B } from "../xg_mono_variation_program";
import {
    LIST_LOW_PASS,
    LIST_MID,
    LIST_SHELF,
    XGDistortionBase
} from "./xg_distortion";

const PARAMETER_RANGES: XGParameterRanges = {
    1: [0, 3],
    2: [34, 60]
};

/**
 * A filter of an amp type: shape, frequency index and gain index (and the width for the mid-filter).
 */
type AmpFilter<S> = readonly [S, number, number, number?];

/**
 * The filters of each amp type: two input filters, the cabinet shelf and the cabinet mid-filter.
 */
const AMP_TYPES: readonly (readonly [
    AmpFilter<XGFilterShape>,
    AmpFilter<XGFilterShape>,
    AmpFilter<XGFilterShape>,
    AmpFilter<XGBiquadShape>
])[] = [
    [
        ["gain", 0, 70],
        ["gain", 0, 70],
        ["gain", 0, 64],
        ["gain", 0, 64, 0]
    ],
    [
        ["highPass", 25, 70],
        ["lowPass", 48, 70],
        ["lowShelf", 25, 76],
        ["highShelf", 41, 76, 0]
    ],
    [
        ["highPass", 23, 70],
        ["lowPass", 51, 70],
        ["lowShelf", 26, 69],
        ["peaking", 34, 58, 19]
    ],
    [
        ["highPass", 26, 70],
        ["lowPass", 41, 70],
        ["lowShelf", 15, 76],
        ["peaking", 43, 76, 20]
    ]
];

/**
 * AMP SIMULATOR (`4B 00`): the distortion with four amp types (input filters and cabinet EQ).
 */
export class XGAmpSimulator extends XGDistortionBase {
    public readonly type = 0x4b_00;
    protected readonly preset: XGVariationPreset = {
        words: [
            512, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 256, 0, 0
        ],
        defaults: [39, 1, 48, 55, 0, 0, 0, 0, 0, 127, 112, 0, 0, 0, 0, 0]
    };

    protected readonly initOrder = [0, 1, 9, 10];

    protected readonly ranges = PARAMETER_RANGES;

    protected convert(param: number) {
        const p = this.params;
        switch (param) {
            case 0:
            case 3: {
                this.drive(p[0], p[3]);
                break;
            }
            case 1: {
                const [inputA, inputB, shelf, mid] = AMP_TYPES[p[1]];
                this.designFirstOrder(
                    inputA[0],
                    inputA[1],
                    inputA[2],
                    LIST_LOW_A
                );
                this.designFirstOrder(
                    inputB[0],
                    inputB[1],
                    inputB[2],
                    LIST_LOW_B
                );
                this.designFirstOrder(shelf[0], shelf[1], shelf[2], LIST_SHELF);
                this.designSecondOrder(
                    mid[0],
                    mid[1],
                    mid[2],
                    mid[3] ?? 0,
                    LIST_MID
                );
                this.convert(2);
                break;
            }
            case 2: {
                // The low pass gain depends on the amp type
                let gain = 0x46;
                if (p[1] === 1) gain = 0x3e;
                else if (p[1] === 3) gain = 0x45;
                this.designFirstOrder("lowPass", p[2], gain, LIST_LOW_PASS);
                break;
            }
            case 9: {
                this.dryWet();
                break;
            }
            case 10: {
                this.edge(p[10]);
                break;
            }
        }
    }
}
