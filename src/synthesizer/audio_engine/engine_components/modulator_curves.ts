/**
 * Modulator_curves.ts
 * precomputes modulator concave and convex curves and calculates a curve value for a given polarity, direction and type
 */
import {
    type ModulatorCurveType,
    modulatorCurveTypes
} from "../../../soundbank/enums";

// The length of the precomputed curve tables
export const MODULATOR_RESOLUTION = 16_384;

export const MOD_CURVE_TYPES_AMOUNT = Object.keys(modulatorCurveTypes).length;
/**
 * Unipolar positive
 * unipolar negative
 * bipolar positive
 * bipolar negative
 * that's 4
 */
export const MOD_SOURCE_TRANSFORM_POSSIBILITIES = 4;

// Precalculate lookup tables for concave and convex curves
const concave = new Float32Array(MODULATOR_RESOLUTION + 1);
const convex = new Float32Array(MODULATOR_RESOLUTION + 1);
// The equation is taken from FluidSynth as it's the standard for soundFonts
// More precisely, the gen_conv.c file
concave[0] = 0;
concave[concave.length - 1] = 1;

convex[0] = 0;
convex[convex.length - 1] = 1;
for (let i = 1; i < MODULATOR_RESOLUTION - 1; i++) {
    const x =
        (((-200 * 2) / 960) * Math.log(i / (concave.length - 1))) / Math.LN10;
    convex[i] = 1 - x;
    concave[concave.length - 1 - i] = x;
}

/**
 * Transforms a value with a given curve type
 * @param transformType the bipolar and negative flags as a 2-bit number: 0bPD (polarity MSB, direction LSB)
 * @param curveType enumeration of curve types
 * @param value the linear value, 0 to 1
 * @returns the transformed value, 0 to 1, or -1 to 1
 */
export function getModulatorCurveValue(
    transformType: number,
    curveType: ModulatorCurveType,
    value: number
): number {
    const isBipolar = !!(transformType & 0b10);
    const isNegative = !!(transformType & 1);

    // Inverse the value if needed
    if (isNegative) {
        value = 1 - value;
    }
    switch (curveType) {
        case modulatorCurveTypes.linear: {
            if (isBipolar) {
                // Bipolar curve
                return value * 2 - 1;
            }
            return value;
        }

        case modulatorCurveTypes.switch: {
            // Switch
            value = value > 0.5 ? 1 : 0;
            if (isBipolar) {
                // Multiply
                return value * 2 - 1;
            }
            return value;
        }

        case modulatorCurveTypes.concave: {
            // Look up the value
            if (isBipolar) {
                value = value * 2 - 1;
                if (value < 0) {
                    return -concave[Math.trunc(value * -MODULATOR_RESOLUTION)];
                }
                return concave[Math.trunc(value * MODULATOR_RESOLUTION)];
            }
            return concave[Math.trunc(value * MODULATOR_RESOLUTION)];
        }

        case modulatorCurveTypes.convex: {
            // Look up the value
            if (isBipolar) {
                value = value * 2 - 1;
                if (value < 0) {
                    return -convex[Math.trunc(value * -MODULATOR_RESOLUTION)];
                }
                return convex[Math.trunc(value * MODULATOR_RESOLUTION)];
            }
            return convex[Math.trunc(value * MODULATOR_RESOLUTION)];
        }
    }
}
