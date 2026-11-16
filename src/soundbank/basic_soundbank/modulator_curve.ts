/**
 * Modulator_curve.ts
 * the modulator source curves. The built-in curves precompute one table per polarity and direction,
 * so the synthesizer only reads a table when computing a modulator. Custom curves are evaluated from their points.
 */
import { type ModulatorCurveType, ModulatorCurveTypes } from "../enums";

// The length of the precomputed curve tables
const MODULATOR_RESOLUTION = 16_384;

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
     * The precomputed output, one table per transform (0bPD: polarity, direction), indexed by the 14-bit source value.
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
            const table = new Float32Array(MODULATOR_RESOLUTION);
            for (let v = 0; v < MODULATOR_RESOLUTION; v++) {
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
        value = value > 0.5 ? 1 : 0;
        return isBipolar ? value * 2 - 1 : value;
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
