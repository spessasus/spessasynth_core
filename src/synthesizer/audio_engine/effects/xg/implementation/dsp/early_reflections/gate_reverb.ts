import type { XGVariationPreset } from "../xg_variation_program";
import { GATE_RANGES, XGEarlyReflectionsBase } from "./xg_early_reflections";

/**
 * GATE REVERB (`0A 00`): a dense burst of reflections that stops abruptly.
 */
export class XGGateReverb extends XGEarlyReflectionsBase {
    public readonly type = 0x0a_00;
    protected readonly preset: XGVariationPreset = {
        words: [
            256, 256, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 512, 0, 0, 0, 0, 0, 0, 0, 0,
            865, 3223, 1801, 0, 0, 0, 0, 0, 2428, 0, 0, 0, 0, 0, 0, 0, 0, 3059,
            3141
        ],
        defaults: [0, 15, 6, 2, 64, 0, 44, 0, 0, 32, 4, 3, 10, 0, 0, 0]
    };
    protected readonly patternOffset = 6;
    protected readonly densityBlock = 2;
    protected readonly ranges = GATE_RANGES;
}
