import type { XGVariationPreset } from "../xg_variation_program";
import { ER_RANGES, XGEarlyReflectionsBase } from "./xg_early_reflections";

/**
 * EARLY REF 1 (`09 00`): early reflections without the reverb tail.
 */
export class XGEarlyReflection1 extends XGEarlyReflectionsBase {
    public readonly type = 0x09_00;
    protected readonly preset: XGVariationPreset = {
        words: [
            256, 256, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0,
            865, 3223, 1801, 0, 0, 0, 0, 0, 2428, 0, 0, 0, 0, 0, 0, 0, 0, 3059,
            3141
        ],
        defaults: [0, 19, 5, 16, 64, 0, 46, 0, 0, 32, 5, 0, 10, 0, 0, 0]
    };
    protected readonly patternOffset = 0;
    protected readonly densityBlock = 0;
    protected readonly ranges = ER_RANGES;
}
