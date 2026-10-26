import { type XGParameterRanges } from "../xg_dsp_program";
import {
    LIST_LOW_A,
    LIST_LOW_B,
    XGMonoVariationProgram
} from "../xg_mono_variation_program";
import { DELAY_TABLE, MIX_DRY, MIX_WET } from "../xg_dsp_tables";
import {
    DENSITY_ROW,
    DIFFUSION_ADDRESS,
    ER_PATTERNS,
    HIGH_DAMP_FREQUENCY,
    LIVENESS_OFFSET,
    REFLECTION_GAIN,
    ROOM_SCALE
} from "./early_reflection_tables";

// Reflection taps (14) and their gain coefficients
const LIST_REFLECTION_ADDRESS = [
    0x3b, 0x32, 0x3a, 0x31, 0x39, 0x30, 0x38, 0x2f, 0x37, 0x27, 0x36, 0x26,
    0x35, 0x25
];
const LIST_REFLECTION_COEFFICIENT = [
    0xba, 0x9f, 0xb9, 0x9e, 0xb8, 0x9d, 0xb7, 0x9c, 0xb6, 0x9b, 0xb5, 0x9a,
    0xb4, 0x99
];
// Density allpasses: four coefficients and (base, tap) addresses per line
const LIST_DENSITY_COEFFICIENT = [
    0x7f, 0x7e, 0x7c, 0x7b, 0x85, 0x84, 0x82, 0x81, 0x8c, 0x8b, 0x89, 0x88,
    0x98, 0x97, 0x8f, 0x8e
];
const LIST_DENSITY_ADDRESS = [0x2a, 0x24, 0x2c, 0x28, 0x2e, 0x29, 0x34, 0x2b];
const LIST_HIGH_DAMP = [0x78, 0x77, 0x79];

/**
 * The converter index of the mono input level, which depends on the connection.
 */
const MONO_INPUT = 16;

/**
 * The reflection gain word of a gain index.
 * @param index The gain index.
 */
const reflectionGain = (index: number) =>
    REFLECTION_GAIN[Math.min(191, Math.max(0, (index << 16) >> 16))];

/**
 * The S-YXG50 early reflection program, shared by EARLY REF 1/2, GATE REVERB and REVERSE GATE.
 *
 * Fourteen reflection taps of the mono input (a pattern scaled by the room size) are summed in two groups.
 * Diffusion allpasses and a damped feedback loop thicken the reflections.
 * The two groups become the left and right outputs.
 */
export abstract class XGEarlyReflectionsBase extends XGMonoVariationProgram {
    /**
     * The first reflection pattern of the type.
     */
    protected abstract readonly patternOffset: number;
    /**
     * The density row block of the type (6 rows each).
     */
    protected abstract readonly densityBlock: number;
    protected readonly initOrder = [0, 2, 4, 5, 6, 9, 12, MONO_INPUT];
    protected readonly connectionParameters = [9, MONO_INPUT];
    // The damped feedback filter state
    private dampX = 0;
    private dampY = 0;

    protected render(
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        outputGain: number
    ) {
        const memory = this.memory;
        this.mixMono(sampleCount);
        const mask = this.mask;
        const c = this.coefficients;
        const t = this.taps;
        const mono = this.mono;
        const dryL = this.dryLeft;
        const dryR = this.dryRight;
        const outL = c[0xaf] * outputGain,
            outR = c[0xb2] * outputGain;
        const t24 = t[0x24],
            t25 = t[0x25],
            t26 = t[0x26],
            t27 = t[0x27],
            t28 = t[0x28],
            t29 = t[0x29],
            t2a = t[0x2a],
            t2b = t[0x2b],
            t2c = t[0x2c],
            t2d = t[0x2d],
            t2e = t[0x2e],
            t2f = t[0x2f],
            t30 = t[0x30],
            t31 = t[0x31],
            t32 = t[0x32],
            t33 = t[0x33],
            t34 = t[0x34],
            t35 = t[0x35],
            t36 = t[0x36],
            t37 = t[0x37],
            t38 = t[0x38],
            t39 = t[0x39],
            t3a = t[0x3a],
            t3b = t[0x3b],
            t3c = t[0x3c],
            t3d = t[0x3d],
            t3e = t[0x3e];
        let { pointer, dampX, dampY } = this;
        // The original reads some lines again after writing others, mirrored here for coinciding taps
        for (let i = 0; i < sampleCount; i++) {
            const x = mono[i];
            // Two diffusion allpasses on the input
            const k24 = (t24 + pointer) & mask;
            memory[(t2a + pointer) & mask] =
                c[0x7c] * x + memory[k24] * c[0x7b];
            const k28 = (t28 + pointer) & mask;
            const diffused = c[0x7f] * x + memory[k24] * c[0x7e];
            memory[(t2c + pointer) & mask] =
                diffused * c[0x82] + memory[k28] * c[0x81];
            const second = memory[k28];
            // Damped feedback into the reflection line
            const k25 = (t25 + pointer) & mask;
            dampY = c[0x77] * dampX + c[0x78] * memory[k25] + c[0x79] * dampY;
            dampX = memory[k25];
            memory[(t2d + pointer) & mask] =
                c[0x86] * dampY + diffused * c[0x85] + second * c[0x84];
            // Two groups of seven reflections
            const sumA =
                memory[k25] * c[0x99] +
                memory[(t26 + pointer) & mask] * c[0x9a] +
                memory[(t2f + pointer) & mask] * c[0x9c] +
                memory[(t31 + pointer) & mask] * c[0x9e] +
                memory[(t27 + pointer) & mask] * c[0x9b] +
                memory[(t30 + pointer) & mask] * c[0x9d] +
                memory[(t32 + pointer) & mask] * c[0x9f];
            const sumB =
                memory[(t36 + pointer) & mask] * c[0xb5] +
                memory[(t38 + pointer) & mask] * c[0xb7] +
                memory[(t3a + pointer) & mask] * c[0xb9] +
                memory[(t35 + pointer) & mask] * c[0xb4] +
                memory[(t37 + pointer) & mask] * c[0xb6] +
                memory[(t39 + pointer) & mask] * c[0xb8] +
                memory[(t3b + pointer) & mask] * c[0xba];
            memory[(t3d + pointer) & mask] = sumA;
            const groupLeft = memory[(t3c + pointer) & mask] * c[0xbb] + sumB;
            memory[(t3e + pointer) & mask] = sumB;
            const groupRight = memory[(t33 + pointer) & mask] * c[0xa0] + sumA;
            // Output allpasses
            const k29 = (t29 + pointer) & mask;
            memory[(t2e + pointer) & mask] =
                c[0x89] * groupLeft + memory[k29] * c[0x88];
            const left = c[0x8c] * groupLeft + memory[k29] * c[0x8b];
            const k2b = (t2b + pointer) & mask;
            memory[(t34 + pointer) & mask] =
                c[0x8f] * groupRight + memory[k2b] * c[0x8e];
            const right = c[0x98] * groupRight + memory[k2b] * c[0x97];
            outputLeft[i] = outL * left + dryL[i] * outputGain;
            outputRight[i] = outR * right + dryR[i] * outputGain;
            pointer = (pointer - 1) & mask;
        }
        this.pointer = pointer;
        this.dampX = dampX;
        this.dampY = dampY;
    }

    protected override resetState() {
        this.dampX = this.dampY = 0;
    }

    protected convert(param: number) {
        const p = this.params;
        const w = this.coefficientWords;
        switch (param) {
            case 0: {
                this.reflections();
                this.density();
                this.pushCoefficients(LIST_REFLECTION_COEFFICIENT);
                this.pushAddresses(LIST_REFLECTION_ADDRESS);
                this.pushCoefficients(LIST_DENSITY_COEFFICIENT);
                this.pushAddresses(LIST_DENSITY_ADDRESS);
                break;
            }
            case 1:
            case 3: {
                this.reflections();
                this.pushCoefficients(LIST_REFLECTION_COEFFICIENT);
                this.pushAddresses(LIST_REFLECTION_ADDRESS);
                break;
            }
            case 2: {
                const a = this.addressWords;
                const length = DIFFUSION_ADDRESS[p[2]];
                a[0x3c] = (length + a[0x3d]) & 0xff_ff;
                a[0x33] = (length + a[0x3e]) & 0xff_ff;
                this.pushAddresses([0x3c, 0x33]);
                this.density();
                this.pushAddresses([0x2b]);
                break;
            }
            case 4: {
                // Feedback level, 64 is none
                w[0x86] = this.feedbackWord(p[4]);
                this.pushCoefficients([0x86]);
                break;
            }
            case 5: {
                this.designFirstOrder("highPass", p[5], 0x40, LIST_LOW_A);
                break;
            }
            case 6: {
                this.designFirstOrder("lowPass", p[6], 0x40, LIST_LOW_B);
                break;
            }
            case 9: {
                const mix = this.mixIndex();
                w[0xad] = w[0xb1] = MIX_DRY[mix] & 0x3_ff;
                w[0xaf] = w[0xb2] = MIX_WET[mix] & 0x3_ff;
                this.pushCoefficients([0xad, 0xaf, 0xb1, 0xb2]);
                break;
            }
            case 10: {
                this.reflections();
                this.pushCoefficients(LIST_REFLECTION_COEFFICIENT);
                break;
            }
            case 11: {
                this.density();
                this.pushCoefficients(LIST_DENSITY_COEFFICIENT);
                break;
            }
            case 12: {
                this.designFirstOrder(
                    "lowPass",
                    HIGH_DAMP_FREQUENCY[p[12]],
                    0x40,
                    LIST_HIGH_DAMP
                );
                break;
            }
            case MONO_INPUT: {
                this.monoInputLevel();
                break;
            }
        }
    }

    /**
     * Writes the reflection taps and gains from the type, room size, initial delay and liveness.
     */
    private reflections() {
        const p = this.params;
        const a = this.addressWords;
        const w = this.coefficientWords;
        const pattern = (p[0] + this.patternOffset) * 28;
        const scale = ROOM_SCALE[p[1]];
        const liveness = LIVENESS_OFFSET[p[10]] - 0x80;
        const start =
            (((this.toAddress100us(DELAY_TABLE[p[3]]) << 16) >> 16) +
                this.signedAddress(0x2d)) &
            0xff_ff;
        for (let k = 0; k < 14; k++) {
            const delay =
                Math.trunc(
                    (this.toAddress10us(
                        ER_PATTERNS[pattern + k * 2] & 0xff_ff
                    ) *
                        scale) /
                        10
                ) + start;
            let gain = 0;
            let address = 0xff_ff;
            if (delay <= 0xff_ff) {
                address = delay;
                const level = ER_PATTERNS[pattern + k * 2 + 1];
                gain =
                    level < 1
                        ? -reflectionGain(liveness - level) & 0x3_ff
                        : reflectionGain(level + liveness);
            }
            a[LIST_REFLECTION_ADDRESS[k]] = address;
            w[LIST_REFLECTION_COEFFICIENT[k]] = gain;
        }
    }

    /**
     * Writes the density allpasses.
     */
    private density() {
        const p = this.params;
        this.densityAllpasses(
            p[11],
            p[2],
            DENSITY_ROW[this.densityBlock * 6 + p[0]],
            0,
            LIST_DENSITY_COEFFICIENT,
            LIST_DENSITY_ADDRESS
        );
    }
}

/**
 * The parameter ranges of the early reflection types.
 */
export const ER_RANGES: XGParameterRanges = {
    0: [0, 5],
    1: [0, 44],
    2: [0, 10],
    3: [0, 63],
    4: [1, 127],
    5: [0, 52],
    6: [34, 60],
    10: [0, 10],
    11: [0, 3],
    12: [1, 10]
};

/**
 * The parameter ranges of the gate types.
 */
export const GATE_RANGES: XGParameterRanges = { ...ER_RANGES, 0: [0, 1] };
