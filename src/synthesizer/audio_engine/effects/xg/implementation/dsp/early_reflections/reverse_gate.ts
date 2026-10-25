import type { XGVariationPreset } from "../xg_variation_program";
import { GATE_RANGES, XGEarlyReflectionsBase } from "./xg_early_reflections";

/**
 * REVERSE GATE (`0B 00`): the gate reverb with rising reflections.
 */
export class XGReverseGate extends XGEarlyReflectionsBase {
    public readonly type = 0x0b_00;
    protected readonly preset: XGVariationPreset = {
        words: [
            256, 256, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0,
            865, 3223, 1801, 0, 0, 0, 0, 0, 2428, 0, 0, 0, 0, 0, 0, 0, 0, 3059,
            3141
        ],
        defaults: [1, 19, 8, 3, 64, 0, 47, 0, 0, 32, 6, 3, 10, 0, 0, 0]
    };
    protected readonly patternOffset = 8;
    protected readonly densityBlock = 3;
    protected readonly ranges = GATE_RANGES;
}
