import { ModulatorCurve } from "./modulator_curve";
import { ModulatorCurveTypes } from "../enums";
import type { BasicInstrument } from "./basic_instrument";
import type { BasicPreset } from "./basic_preset";
import type { BasicSoundBank } from "./basic_soundbank";
import { SpessaLog } from "../../utils/loggin";

/**
 * An element whose modulators can use a {@link CustomCurve}: an instrument, a preset,
 * or a sound bank (its default modulators).
 *
 * @group Sound Banks.Modulators
 */
export type CustomCurveUser = BasicInstrument | BasicPreset | BasicSoundBank;

/**
 * A single point of a {@link CustomCurve}.
 *
 * @group Sound Banks.Modulators
 */
export interface CustomCurvePoint {
    /**
     * The source value, 0 to 16,384. A 14-bit source value is 0 to 16,383, and a 7-bit source value `v` is at `v << 7`.
     * The value 16,384 is the end of the range, so a curve can be defined up to exactly 1.
     */
    x: number;
    /**
     * The output, 0 to 16,384. A unipolar source outputs `y / 16384`, a bipolar source `(y - 8192) / 8192`.
     */
    y: number;
}

/**
 * A modulator source curve stored in an SFe bank (curve type 4).
 * The value between two points is linearly interpolated.
 *
 * The first point should be at `x = 0` and the last at `x = 16384`. `x` never decreases, and two points at the same `x`
 * make a vertical step.
 *
 * > **Tip**
 * >
 * > Consider reading about [the SFe format.](../../../docs/extra/sfe-format.md)
 *
 * @group Sound Banks.Modulators
 */
export class CustomCurve extends ModulatorCurve {
    /**
     * The name of the curve, up to 40 characters are written.
     */
    public name: string;

    /**
     * The elements that use this curve, one entry for each modulator source using it.
     * The default modulators of a sound bank are listed as the bank.
     *
     * > **Note**
     * >
     * > Duplicate entries are allowed since one element can use the same curve multiple times.
     */
    public readonly linkedTo = new Array<CustomCurveUser>();

    private storedPoints: readonly Readonly<CustomCurvePoint>[];

    // The points as typed arrays, for the evaluation
    private px = new Int32Array(0);
    private py = new Float64Array(0);
    // For each x >> 7 (0 to 128): the last point with x <= (x >> 7) * 128, -1 if there is none
    private readonly start = new Int32Array(129);
    // The unipolar and bipolar outputs at every multiple of 128, so 7-bit sources are a single read
    private readonly gridUnipolar = new Float32Array(129);
    private readonly gridBipolar = new Float32Array(129);

    /**
     * Creates a new custom curve.
     * @param points The points, ordered by `x`. At least two are needed.
     * @param name The name of the curve.
     */
    public constructor(points: readonly CustomCurvePoint[], name = "") {
        super(ModulatorCurveTypes.custom);
        this.name = name;
        this.storedPoints = CustomCurve.checkPoints(points);
        this.precompute();
    }

    /**
     * The number of modulator sources using this curve.
     */
    public get useCount() {
        return this.linkedTo.length;
    }

    /**
     * The curve points, ordered by `x`. They are frozen, use {@link setPoints} to change them.
     */
    public get points() {
        return this.storedPoints;
    }

    // Validates the points and returns a frozen copy, so they can't change without rebuilding the tables
    private static checkPoints(points: readonly CustomCurvePoint[]) {
        if (points.length < 2) {
            throw new Error(
                `A custom curve needs at least 2 points, got ${points.length}.`
            );
        }
        for (const [i, { x, y }] of points.entries()) {
            if (
                !Number.isInteger(x) ||
                !Number.isInteger(y) ||
                x < 0 ||
                x > 16_384 ||
                y < 0 ||
                y > 16_384
            ) {
                throw new Error(
                    `Custom curve point ${i} (${x}, ${y}) is out of range.`
                );
            }
            if (i > 0 && x < points[i - 1].x) {
                throw new Error(
                    `Custom curve point ${i} goes back in x (${points[i - 1].x} to ${x}).`
                );
            }
        }
        return Object.freeze(
            points.map((p) => Object.freeze({ x: p.x, y: p.y }))
        );
    }

    /**
     * Links the curve to an element that uses it.
     * @param user The element.
     * @internal
     */
    public linkTo(user: CustomCurveUser) {
        this.linkedTo.push(user);
    }

    /**
     * Unlinks the curve from an element.
     * @param user The element that no longer uses it.
     * @internal
     */
    public unlinkFrom(user: CustomCurveUser) {
        const index = this.linkedTo.indexOf(user);
        if (index === -1) {
            SpessaLog.warn(
                `Cannot unlink ${"soundBankInfo" in user ? "the default modulators" : user.name} from curve ${this.toString()}: not linked.`
            );
            return;
        }
        this.linkedTo.splice(index, 1);
    }

    /**
     * Replaces the points of the curve. Every modulator using this curve follows the change.
     * @param points The new points, ordered by `x`. At least two are needed.
     * @throws Error if the points are invalid. The curve is left unchanged then.
     */
    public setPoints(points: readonly CustomCurvePoint[]) {
        this.storedPoints = CustomCurve.checkPoints(points);
        this.precompute();
    }

    /**
     * Checks if two curves have the same points.
     * @param other The curve to compare against.
     */
    public isIdentical(other: ModulatorCurve) {
        if (other === this) return true;
        if (!(other instanceof CustomCurve)) return false;
        if (other.points.length !== this.points.length) return false;
        return this.points.every(
            (p, i) => p.x === other.points[i].x && p.y === other.points[i].y
        );
    }

    /**
     * Gets the curve's `y` for a source value.
     * At a vertical step, the last point with that `x` wins.
     * @param x The source value, 0 to 16,384.
     * @returns The interpolated `y`, 0 to 16,384.
     * @internal
     */
    public getY(x: number) {
        const px = this.px;
        const last = px.length - 1;
        // Jump close to the segment, then step to the last point with px <= x
        let i = this.start[x >> 7];
        while (i < last && px[i + 1] <= x) i++;
        if (i < 0) return this.py[0];
        if (i === last) return this.py[last];
        const ay = this.py[i];
        return ay + ((this.py[i + 1] - ay) * (x - px[i])) / (px[i + 1] - px[i]);
    }

    /**
     * Gets the output of a source using this curve.
     * @param raw The 14-bit source value, 0 to 16,383.
     * @param isBipolar If the source is bipolar.
     * @param isNegative If the source direction is negative.
     * @returns The output, 0 to 1, or -1 to 1 when bipolar.
     * @internal
     */
    public getValue(raw: number, isBipolar: boolean, isNegative: boolean) {
        // The reversed value is 16384 - x like the SF2 curves, so 64 stays the center
        const x = isNegative ? 16_384 - raw : raw;
        // 7-bit sources always land on the grid
        if ((x & 127) === 0) {
            return isBipolar
                ? this.gridBipolar[x >> 7]
                : this.gridUnipolar[x >> 7];
        }
        const y = this.getY(x);
        // Rounded to a float like the built-in curve tables
        return Math.fround(isBipolar ? (y - 8192) / 8192 : y / 16_384);
    }

    public toString() {
        return this.name || `Custom curve (${this.points.length} points)`;
    }

    protected evaluate(value: number, isBipolar: boolean) {
        return this.getValue(Math.round(value * 16_384), isBipolar, false);
    }

    // Builds the evaluation arrays from the points
    private precompute() {
        const points = this.storedPoints;
        this.px = Int32Array.from(points, (p) => p.x);
        this.py = Float64Array.from(points, (p) => p.y);
        let i = -1;
        for (let c = 0; c <= 128; c++) {
            const x = c * 128;
            while (i < points.length - 1 && points[i + 1].x <= x) i++;
            this.start[c] = i;
            const y = this.getY(x);
            this.gridUnipolar[c] = y / 16_384;
            this.gridBipolar[c] = (y - 8192) / 8192;
        }
    }
}
