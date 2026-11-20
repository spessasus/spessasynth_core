/**
 * Modulator_curve.ts
 * the modulator source curves. The built-in curves precompute one table per polarity and direction,
 * so the synthesizer only reads a table when computing a modulator. Custom curves are evaluated from their points.
 */
import { type ModulatorCurveType, ModulatorCurveTypes } from "../enums";

// The source value range, 0 to 16384 (SFe 4.0, section 7.2). The precomputed tables have one more entry, so 16384 is a real index
const MODULATOR_RESOLUTION = 16_384;

/**
 * The source value of a 7-bit value (velocity, key, pressures, controllers), center-max (SFe 4.0, section 7.2).
 * 64 is exactly the center (8192) and 127 exactly the end (16384).
 * @internal
 */
export const SOURCE_VALUE_7_BIT = new Uint16Array(128);
for (let v = 0; v < 128; v++) {
    SOURCE_VALUE_7_BIT[v] =
        v <= 64 ? v * 128 : Math.round(8192 + (8192 * (v - 64)) / 63);
}

/**
 * The source value of a 14-bit value (the pitch wheel and the computed ranges), center-max (SFe 4.0, section 7.2).
 * 8192 stays the center and 16383 is exactly the end (16384).
 * @internal
 */
export const SOURCE_VALUE_14_BIT = new Uint16Array(16_384);
for (let w = 0; w < 16_384; w++) {
    SOURCE_VALUE_14_BIT[w] =
        w <= 8192 ? w : Math.round(8192 + (8192 * (w - 8192)) / 8191);
}

// Precalculate lookup tables for concave and convex curves
const concave = new Float32Array(MODULATOR_RESOLUTION + 1);
const convex = new Float32Array(MODULATOR_RESOLUTION + 1);
// The equation is taken from FluidSynth as it's the standard for soundFonts
// More precisely, the gen_conv.c file
concave[0] = 0;
concave[concave.length - 1] = 1;

convex[0] = 0;
convex[convex.length - 1] = 1;
for (let i = 1; i < MODULATOR_RESOLUTION; i++) {
    // The formula was made for a 128-entry table.
    // At this resolution it goes above 1 near the ends, so clamp it.
    const x = Math.min(
        1,
        (((-200 * 2) / 960) * Math.log(i / (concave.length - 1))) / Math.LN10
    );
    convex[i] = 1 - x;
    concave[concave.length - 1 - i] = x;
}

/**
 * A modulator source curve: how the source's minimum value approaches its maximum value.
 * The four SF2 curves are built in, {@link CustomCurve} is a curve stored in an SFe bank.
 *
 * @group Sound Banks.Modulators
 */
export abstract class ModulatorCurve {
    /**
     * The curve type, as written in the source enum.
     */
    public readonly type: ModulatorCurveType;

    /**
     * The precomputed output, one table per transform (0bPD: polarity, direction), indexed by the source value
     * (0 to 16,384).
     * @internal
     */
    public readonly tables = new Array<Float32Array>();

    protected constructor(type: ModulatorCurveType) {
        this.type = type;
    }

    /**
     * Gets the curve for a curve type. Built-in curves are shared.
     * A custom curve or an unknown type gives a curve that outputs 0 until a real curve is assigned.
     * @param type the curve type
     * @internal
     */
    public static fromType(type: ModulatorCurveType): ModulatorCurve {
        const builtIn = BUILT_IN_CURVES[type];
        if (builtIn) return builtIn;
        let unresolved = UNRESOLVED_CURVES.get(type);
        if (!unresolved) {
            unresolved = new UnresolvedCurve(type);
            UNRESOLVED_CURVES.set(type, unresolved);
        }
        return unresolved;
    }

    /**
     * Checks if two curves give the same output.
     * @param other The curve to compare against.
     */
    public isIdentical(other: ModulatorCurve) {
        // A custom curve is only identical to a custom curve with the same points, never to an unresolved one
        return (
            other === this ||
            (other.type === this.type &&
                this.type !== ModulatorCurveTypes.custom)
        );
    }

    public toString() {
        return (
            Object.keys(ModulatorCurveTypes).find(
                (k) =>
                    ModulatorCurveTypes[
                        k as keyof typeof ModulatorCurveTypes
                    ] === this.type
            ) ?? this.type.toString()
        );
    }

    /**
     * Computes the tables. The built-in curves call this at the end of their constructor,
     * so it never runs while rendering. Custom curves have no tables.
     */
    protected buildTables() {
        for (let transform = 0; transform < 4; transform++) {
            const isBipolar = (transform & 0b10) !== 0;
            const isNegative = (transform & 1) !== 0;
            const table = new Float32Array(MODULATOR_RESOLUTION + 1);
            for (let v = 0; v <= MODULATOR_RESOLUTION; v++) {
                const value = v / MODULATOR_RESOLUTION;
                table[v] = this.evaluate(
                    isNegative ? 1 - value : value,
                    isBipolar
                );
            }
            this.tables[transform] = table;
        }
    }

    /**
     * Computes the output of the curve.
     * @param value the source value, 0 to 1, already reversed for the negative direction
     * @param isBipolar if the output is bipolar
     * @returns the output, 0 to 1, or -1 to 1 when bipolar
     */
    protected abstract evaluate(value: number, isBipolar: boolean): number;
}

class LinearCurve extends ModulatorCurve {
    public constructor() {
        super(ModulatorCurveTypes.linear);
        this.buildTables();
    }

    protected evaluate(value: number, isBipolar: boolean) {
        return isBipolar ? value * 2 - 1 : value;
    }
}

class ConcaveCurve extends ModulatorCurve {
    public constructor() {
        super(ModulatorCurveTypes.concave);
        this.buildTables();
    }

    protected evaluate(value: number, isBipolar: boolean) {
        if (isBipolar) {
            value = value * 2 - 1;
            if (value < 0) {
                return -concave[Math.trunc(value * -MODULATOR_RESOLUTION)];
            }
        }
        return concave[Math.trunc(value * MODULATOR_RESOLUTION)];
    }
}

class ConvexCurve extends ModulatorCurve {
    public constructor() {
        super(ModulatorCurveTypes.convex);
        this.buildTables();
    }

    protected evaluate(value: number, isBipolar: boolean) {
        if (isBipolar) {
            value = value * 2 - 1;
            if (value < 0) {
                return -convex[Math.trunc(value * -MODULATOR_RESOLUTION)];
            }
        }
        return convex[Math.trunc(value * MODULATOR_RESOLUTION)];
    }
}

class SwitchCurve extends ModulatorCurve {
    public constructor() {
        super(ModulatorCurveTypes.switch);
        this.buildTables();
    }

    protected evaluate(value: number, isBipolar: boolean) {
        value = value >= 0.5 ? 1 : 0;
        return isBipolar ? value * 2 - 1 : value;
    }

    protected buildTables() {
        // SF2 switches on after half of the maximum, so the center (8192, CC value 64) is already on.
        // The negative direction is the exact opposite, off from the center up
        for (let transform = 0; transform < 4; transform++) {
            const isBipolar = (transform & 0b10) !== 0;
            const isNegative = (transform & 1) !== 0;
            const table = new Float32Array(MODULATOR_RESOLUTION + 1);
            for (let v = 0; v <= MODULATOR_RESOLUTION; v++) {
                const on = v >= MODULATOR_RESOLUTION / 2 !== isNegative;
                table[v] = this.evaluate(on ? 1 : 0, isBipolar);
            }
            this.tables[transform] = table;
        }
    }
}

// A custom curve that was never assigned, or a curve type this version does not know
class UnresolvedCurve extends ModulatorCurve {
    public constructor(type: ModulatorCurveType) {
        super(type);
        this.buildTables();
    }

    protected evaluate() {
        return 0;
    }
}

// Indexed by the curve type
const BUILT_IN_CURVES: (ModulatorCurve | undefined)[] = [
    new LinearCurve(),
    new ConcaveCurve(),
    new ConvexCurve(),
    new SwitchCurve()
];
const UNRESOLVED_CURVES = new Map<ModulatorCurveType, ModulatorCurve>();
