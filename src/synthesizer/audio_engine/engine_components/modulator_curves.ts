/**
 * Modulator_curves.ts
 * precomputes modulator concave and convex curves and calculates a curve value for a given polarity, direction and type
 */
import type { ModulatorNumericBool } from "../../../soundbank/types";
import {
    type ModulatorCurveType,
    modulatorCurveTypes
} from "../../../soundbank/enums";

// The length of the precomputed curve tables
export const MOD_PRECOMPUTED_LENGTH = 16384;

// Precalculate lookup tables for concave and convex curves
const concave = new Float32Array(MOD_PRECOMPUTED_LENGTH + 1);
const convex = new Float32Array(MOD_PRECOMPUTED_LENGTH + 1);
// The equation is taken from FluidSynth as it's the standard for soundFonts
// More precisely, the gen_conv.c file
concave[0] = 0;
concave[concave.length - 1] = 1;

convex[0] = 0;
convex[convex.length - 1] = 1;
for (let i = 1; i < MOD_PRECOMPUTED_LENGTH - 1; i++) {
    const x =
        (((-200 * 2) / 960) * Math.log(i / (concave.length - 1))) / Math.LN10;
    convex[i] = 1 - x;
    concave[concave.length - 1 - i] = x;
}

/**
 * Transforms a value with a given curve type
 * @param polarity 0 or 1
 * @param direction 0 or 1
 * @param curveType enumeration of curve types
 * @param value the linear value, 0 to 1
 * @returns the transformed value, 0 to 1, or -1 to 1
 */
export function getModulatorCurveValue(
    direction: ModulatorNumericBool,
    curveType: ModulatorCurveType,
    value: number,
    polarity: ModulatorNumericBool
): number {
    // Inverse the value if needed
    if (direction) {
        value = 1 - value;
    }
    switch (curveType) {
        case modulatorCurveTypes.linear:
            if (polarity) {
                // Bipolar curve
                return value * 2 - 1;
            }
            return value;

        case modulatorCurveTypes.switch:
            // Switch
            value = value > 0.5 ? 1 : 0;
            if (polarity) {
                // Multiply
                return value * 2 - 1;
            }
            return value;

        case modulatorCurveTypes.concave:
            // Look up the value
            if (polarity) {
                value = value * 2 - 1;
                if (value < 0) {
                    return -concave[~~(value * -MOD_PRECOMPUTED_LENGTH)];
                }
                return concave[~~(value * MOD_PRECOMPUTED_LENGTH)];
            }
            return concave[~~(value * MOD_PRECOMPUTED_LENGTH)];

        case modulatorCurveTypes.convex:
            // Look up the value
            if (polarity) {
                value = value * 2 - 1;
                if (value < 0) {
                    return -convex[~~(value * -MOD_PRECOMPUTED_LENGTH)];
                }
                return convex[~~(value * MOD_PRECOMPUTED_LENGTH)];
            }
            return convex[~~(value * MOD_PRECOMPUTED_LENGTH)];
    }
}
