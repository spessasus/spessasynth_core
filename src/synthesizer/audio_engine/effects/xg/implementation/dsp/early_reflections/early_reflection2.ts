import type { XGVariationPreset } from "../xg_variation_program";
import { ER_RANGES, XGEarlyReflectionsBase } from "./xg_early_reflections";

/**
 * EARLY REF 2 (`09 01`): early reflections with other defaults.
 */
export class XGEarlyReflection2 extends XGEarlyReflectionsBase {
    public readonly type = 0x09_01;
    protected readonly preset: XGVariationPreset = {
        words: [
            256, 256, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0,
            865, 3223, 1801, 0, 0, 0, 0, 0, 2428, 0, 0, 0, 0, 0, 0, 0, 0, 3059,
            3141
        ],
        defaults: [2, 7, 10, 16, 64, 3, 46, 0, 0, 32, 5, 2, 10, 0, 0, 0]
    };
    protected readonly patternOffset = 0;
    protected readonly densityBlock = 1;
    protected readonly ranges = ER_RANGES;
}
