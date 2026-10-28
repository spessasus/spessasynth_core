import { XGStereoVariationProgram } from "../xg_stereo_variation_program";
import {
    chop32,
    PHASE_MASK,
    triangle,
    TRIANGLE_SCALE
} from "../xg_dsp_program";

// LFO shaping push lists (input smoothing, feedback smoothing, offset, center)
export const LIST_SHAPE_LEFT = [0x72, 0x71, 0x6f, 0x73];
export const LIST_SHAPE_RIGHT = [0x7c, 0x7b, 0x7a, 0x7d];

/**
 * Clamps a value to -1..1.
 * @param v The value.
 */
const clip = (v: number) => (v > 1 ? 1 : Math.max(v, -1));

/**
 * The S-YXG50 tremolo program, shared by TREMOLO and AUTO PAN.
 *
 * A triangle LFO, offset, clipped and smoothed (a rate-dependent one-pole) shapes the waveform,
 * then drives an amplitude modulation and a modulated delay tap (pitch modulation) on each side.
 */
export abstract class XGTremoloBase extends XGStereoVariationProgram {
    /**
     * The variation output level of the type (/64).
     */
    protected abstract readonly variationGain: number;

    // LFO shaping states and the modulation values (updated every 4 samples)
    private smoothLeft = 0;
    private smoothRight = 0;
    private lfoCounter = 0;
    private intLeft = 0;
    private fracLeft = 0;
    private intRight = 0;
    private fracRight = 0;
    private ampLeft = 1;
    private ampRight = 1;

    protected override resetState() {
        this.smoothLeft = this.smoothRight = 0;
        this.lfoCounter = 0;
        this.intLeft = this.intRight = 0;
        this.fracLeft = this.fracRight = 0;
        this.ampLeft = this.ampRight = 1;
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
        const tReadL = t[0x28],
            tReadR = t[0x2d],
            tWriteL = t[0x3a],
            tWriteR = t[0x3b];
        const rightToL = c[0xaa],
            rightToR = c[0xad];
        const outL = c[0xb4] * outputGain,
            outR = c[0xb9] * outputGain;
        const { lfoStep, lfoOffset1, lfoOffset2 } = this;
        const inL = this.inputLeft;
        const inR = this.inputRight;
        let {
            pointer,
            lfoPhase,
            lfoCounter,
            smoothLeft,
            smoothRight,
            intLeft,
            fracLeft,
            intRight,
            fracRight,
            ampLeft,
            ampRight
        } = this;
        for (let i = 0; i < sampleCount; i++) {
            if ((lfoCounter++ & 3) === 0) {
                // Triangle, offset and clip, smooth, then rescale and clip again.
                // Truncating float32 math like the original, the smoothing pole is close to 1
                lfoPhase = (lfoPhase + lfoStep) & PHASE_MASK;
                const shapeL = clip(
                    chop32(
                        triangle((lfoPhase - lfoOffset1) & PHASE_MASK) *
                            TRIANGLE_SCALE -
                            c[0x6f]
                    )
                );
                const shapeR = clip(
                    chop32(
                        triangle((lfoPhase - lfoOffset2) & PHASE_MASK) *
                            TRIANGLE_SCALE -
                            c[0x7a]
                    )
                );
                smoothLeft = chop32(
                    chop32(shapeL * c[0x72]) + chop32(c[0x71] * smoothLeft)
                );
                smoothRight = chop32(
                    chop32(shapeR * c[0x7c]) + chop32(c[0x7b] * smoothRight)
                );
                const x = clip(chop32(chop32(smoothLeft - c[0x73]) * 4));
                const y = clip(chop32(chop32(smoothRight - c[0x7d]) * 4));
                // Delay modulation (truncated, so the fraction can be negative) and amplitude
                const vL = chop32(
                    chop32(x * c[0x75]) - chop32(c[0x76] * c[0x74])
                );
                const vR = chop32(
                    chop32(y * c[0x85]) - chop32(c[0x86] * c[0x84])
                );
                intLeft = Math.trunc(vL);
                intRight = Math.trunc(vR);
                fracLeft = chop32(vL - intLeft);
                fracRight = chop32(vR - intRight);
                ampLeft = chop32(chop32(x * c[0x83]) + 1);
                ampRight = chop32(chop32(y * c[0x94]) + 1);
            }
            let k = (tReadL + pointer + intLeft) & mask;
            const tapL =
                (memory[(k + 1) & mask] - memory[k]) * fracLeft + memory[k];
            k = (tReadR + pointer + intRight) & mask;
            const tapR =
                (memory[(k + 1) & mask] - memory[k]) * fracRight + memory[k];
            const r = inR[i];
            // The right line is written first, so the left line wins if both inputs share an address.
            // Below 44.1 kHz the input addresses 1 and 0 both scale to 0, which would silence the left line.
            // At 44.1 kHz the left line overwrites the same sample one step later, so this matches it.
            memory[(tWriteR + pointer) & mask] = rightToR * r;
            memory[(tWriteL + pointer) & mask] = rightToL * r + inL[i];
            outputLeft[i] = tapL * ampLeft * outL;
            outputRight[i] = tapR * ampRight * outR;
            pointer = (pointer - 1) & mask;
        }
        this.pointer = pointer;
        this.lfoPhase = lfoPhase;
        this.lfoCounter = lfoCounter & 3;
        this.smoothLeft = smoothLeft;
        this.smoothRight = smoothRight;
        this.intLeft = intLeft;
        this.fracLeft = fracLeft;
        this.intRight = intRight;
        this.fracRight = fracRight;
        this.ampLeft = ampLeft;
        this.ampRight = ampRight;
    }

    /**
     * Shapes the LFO waveform from its rate: the smoothing follows the rate.
     * @param list The shaping coefficient list of one side.
     */
    protected shapeLFO(list: readonly number[]) {
        const w = this.coefficientWords;
        const rate = w[0x77];
        w[list[1]] = w[list[0]] = rate;
        w[list[2]] = Math.min(10, (rate << 16) >> 20) + 0xf5;
        w[list[3]] = 0x3_c0;
        this.pushCoefficients(list);
    }

    /**
     * The output level word for the given level.
     * @param level The level (0x200 is unity).
     */
    protected outputWord(level: number) {
        return (this.variationGain * level) >> 6;
    }
}
