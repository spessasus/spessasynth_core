import { XGStereoVariationProgram } from "../xg_stereo_variation_program";
import { FILTER_GAIN } from "../xg_dsp_tables";
import { biasedRound } from "../xg_dsp_program";

/**
 * The input position of the left line.
 */
export const LEFT_BASE = 0x3a;
/**
 * The input position of the right line.
 */
export const RIGHT_BASE = 0x3b;
/**
 * The right line input position used by the two-line delays (in the upper half of the memory).
 */
export const RIGHT_LINE_START = 16_384;

// Damping filter push lists (input, feedback)
export const LIST_DAMP_A = [0x9f, 0x9e];
export const LIST_DAMP_B = [0xa1, 0xa0];

/**
 * The S-YXG50 variation delay program, shared by DELAY L,C,R, DELAY L,R, ECHO and CROSS DELAY.
 *
 * Two delay lines with two damped feedback taps (A, B) and two output taps (C, D).
 * A coefficient matrix routes the inputs and feedback taps into the lines and the taps into the outputs,
 * each type sets its own routing.
 */
export abstract class XGDelayBase extends XGStereoVariationProgram {
    protected readonly connectionParameters = [9];
    // Damping filter states
    private dampA = 0;
    private dampB = 0;

    protected override resetState() {
        this.dampA = this.dampB = 0;
    }

    protected render(
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        outputGain: number
    ) {
        const memory = this.memory;
        const mask = this.mask;
        const c = this.coefficients;
        const t = this.taps;
        const tA = t[0x28],
            tB = t[0x2d],
            tC = t[0x33],
            tD = t[0x38],
            tWriteA = t[0x3a],
            tWriteB = t[0x3b];
        const dampInA = c[0x9f],
            dampFbA = c[0x9e],
            dampInB = c[0xa1],
            dampFbB = c[0xa0];
        // Line inputs: right input, damped A, damped B (the left input enters line A directly)
        const rightToA = c[0xaa],
            aToA = c[0xab],
            bToA = c[0xac];
        const rightToB = c[0xad],
            aToB = c[0xae],
            bToB = c[0xaf];
        // Outputs: left input, right input, A or B, C, D
        const leftToL = c[0xb2] * outputGain,
            rightToL = c[0xb3] * outputGain,
            aToL = c[0xb4] * outputGain,
            cToL = c[0xb5] * outputGain,
            dToL = c[0xb6] * outputGain;
        const leftToR = c[0xb7] * outputGain,
            rightToR = c[0xb8] * outputGain,
            bToR = c[0xb9] * outputGain,
            cToR = c[0xba] * outputGain,
            dToR = c[0xbb] * outputGain;
        const inL = this.inputLeft;
        const inR = this.inputRight;
        let { pointer, dampA, dampB } = this;
        for (let i = 0; i < sampleCount; i++) {
            const a = memory[(tA + pointer) & mask];
            const b = memory[(tB + pointer) & mask];
            const tapC = memory[(tC + pointer) & mask];
            const tapD = memory[(tD + pointer) & mask];
            const dampedA = a * dampInA + dampFbA * dampA;
            dampA = a;
            const dampedB = b * dampInB + dampFbB * dampB;
            dampB = b;
            const l = inL[i];
            const r = inR[i];
            // The right line is written first, so the left line wins if both inputs share an address.
            // Below 44.1 kHz the input addresses 1 and 0 both scale to 0, which would silence the left line.
            // At 44.1 kHz the left line overwrites the same sample one step later, so this matches it.
            memory[(tWriteB + pointer) & mask] =
                rightToB * r + dampedA * aToB + dampedB * bToB;
            memory[(tWriteA + pointer) & mask] =
                rightToA * r + dampedA * aToA + dampedB * bToA + l;
            outputLeft[i] =
                rightToL * r +
                a * aToL +
                tapC * cToL +
                tapD * dToL +
                leftToL * l;
            outputRight[i] =
                leftToR * l +
                b * bToR +
                tapC * cToR +
                tapD * dToR +
                rightToR * r;
            pointer = (pointer - 1) & mask;
        }
        this.pointer = pointer;
        this.dampA = dampA;
        this.dampB = dampB;
    }

    /**
     * Places a delay tap relative to a line input.
     * @param tap The tap index.
     * @param time The delay time (0.1 ms units).
     * @param base The line input address index.
     */
    protected placeTap(tap: number, time: number, base: number) {
        this.addressWords[tap] =
            this.toAddress100us(time) + this.signedAddress(base);
        this.pushAddresses([tap]);
    }

    /**
     * Designs a feedback damping filter (a one-pole low-pass) from the high damp parameter.
     * @param damp The high damp value (1-10).
     * @param list The coefficient indices for the input and feedback coefficients.
     */
    protected designDamping(damp: number, list: readonly number[]) {
        const gain = FILTER_GAIN[0x40];
        const k = Math.fround((damp + 8) / 18);
        const input = Math.fround(k * gain);
        const feedback = Math.fround(Math.fround(1 - k) * gain);
        const round = (v: number) => Math.trunc(biasedRound(v * 512)) & 0x3_ff;
        this.coefficientWords[list[0]] = round(input);
        this.coefficientWords[list[1]] = round(feedback);
        this.pushCoefficients(list);
    }
}
