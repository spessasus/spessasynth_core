import { type XGParameterRanges } from "../xg_dsp_program";
import type { XGVariationPreset } from "../xg_variation_program";
import { LIST_LOW_A, LIST_LOW_B } from "../xg_mono_variation_program";
import {
    LIST_LOW_PASS,
    LIST_MID,
    LIST_SHELF,
    XGDistortionBase
} from "./xg_distortion";

const PARAMETER_RANGES: XGParameterRanges = {
    1: [8, 40],
    2: [52, 76],
    3: [34, 60],
    6: [28, 54],
    7: [52, 76],
    8: [10, 120]
};

/**
 * The converter index of the input filters, designed once per type load.
 */
const INPUT_FILTERS = 16;

/**
 * DISTORTION (`49 00`): hard clipping with a low shelf, low pass and mid EQ.
 */
export class XGDistortion extends XGDistortionBase {
    public readonly type: number = 0x49_00;
    protected readonly preset: XGVariationPreset = {
        words: [
            512, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 256, 0, 0
        ],
        defaults: [40, 20, 72, 53, 48, 0, 43, 74, 10, 127, 120, 0, 0, 0, 0, 0]
    };
    /**
     * The input high pass frequency index.
     */
    protected readonly highPassFrequency: number = 0;
    /**
     * The input low pass frequency index.
     */
    protected readonly lowPassFrequency: number = 0x36;

    protected readonly initOrder = [INPUT_FILTERS, 0, 1, 3, 6, 9, 10];

    protected readonly ranges = PARAMETER_RANGES;

    protected convert(param: number) {
        const p = this.params;
        switch (param) {
            case INPUT_FILTERS: {
                this.designFirstOrder(
                    "highPass",
                    this.highPassFrequency,
                    0x46,
                    LIST_LOW_A
                );
                this.designFirstOrder(
                    "lowPass",
                    this.lowPassFrequency,
                    0x46,
                    LIST_LOW_B
                );
                break;
            }
            case 0:
            case 4: {
                this.drive(p[0], p[4]);
                break;
            }
            case 1:
            case 2: {
                this.designFirstOrder("lowShelf", p[1], p[2], LIST_SHELF);
                break;
            }
            case 3: {
                this.designFirstOrder("lowPass", p[3], 0x43, LIST_LOW_PASS);
                break;
            }
            case 6:
            case 7:
            case 8: {
                this.designSecondOrder("peaking", p[6], p[7], p[8], LIST_MID);
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
