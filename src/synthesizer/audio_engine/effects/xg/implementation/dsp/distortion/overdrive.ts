import type { XGVariationPreset } from "../xg_variation_program";
import { XGDistortion } from "./distortion";

/**
 * OVER DRIVE (`4A 00`): the distortion with softer defaults and a narrower input band.
 */
export class XGOverdrive extends XGDistortion {
    public override readonly type = 0x4a_00;
    protected override readonly preset: XGVariationPreset = {
        words: [
            512, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 256, 0, 0
        ],
        defaults: [29, 24, 68, 45, 55, 0, 41, 72, 10, 127, 104, 0, 0, 0, 0, 0]
    };
    protected override readonly highPassFrequency = 8;
    protected override readonly lowPassFrequency = 0x2c;
}
