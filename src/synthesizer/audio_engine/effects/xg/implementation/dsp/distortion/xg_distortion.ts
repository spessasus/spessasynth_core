import { XGMonoVariationProgram } from "../xg_mono_variation_program";
import { PAN_LEFT, PAN_RIGHT } from "../xg_dsp_tables";
import { OUTPUT_LEVEL } from "./distortion_tables";

// Output filter push lists: low pass (b0, b1, a1), low shelf (b0, b1, a1), mid (b0, b1, b2, a1, a2)
export const LIST_LOW_PASS = [0xa3, 0xa2, 0xa4];
export const LIST_SHELF = [0xab, 0xaa, 0xac];
export const LIST_MID = [0xa9, 0xa8, 0xa7, 0xa6, 0xa5];

/**
 * The clipping range (the original works on a 16-bit scale, which is 4 times the full scale).
 */
const CLIP_HIGH = 131_071 / 32_768;
const CLIP_LOW = -4;

/**
 * The variation output level of the distortion types (/64).
 */
const VARIATION_GAIN = 63;

/**
 * Clamps a value to the clipping range.
 * @param v The value.
 */
const clip = (v: number) => (v > CLIP_HIGH ? CLIP_HIGH : Math.max(v, CLIP_LOW));

/**
 * The S-YXG50 distortion program, shared by DISTORTION, OVER DRIVE and AMP SIMULATOR.
 *
 * The mono input (band limited by the input filters) drives a chain of six gain-and-clip stages,
 * the weighted sum of all stages is the waveshaped signal.
 * A low pass, a mid peaking EQ and a low shelf (the amp simulator's cabinet) follow.
 */
export abstract class XGDistortionBase extends XGMonoVariationProgram {
    public static override readonly memorySize = 0;
    protected readonly connectionParameters = [9];

    protected render(
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        outputGain: number
    ) {
        this.mixMono(sampleCount);
        const c = this.coefficients;
        const drive = c[0x76],
            gain2 = c[0x83],
            gain3 = c[0x87],
            gain4 = c[0x8a],
            gain5 = c[0x8d],
            gain6 = c[0x90];
        const mix1 = c[0x91],
            mix2 = c[0x92],
            mix3 = c[0x93],
            mix4 = c[0x94],
            mix5 = c[0x95],
            mix6 = c[0x96],
            level = c[0xa1];
        const mono = this.mono;
        for (let i = 0; i < sampleCount; i++) {
            const s1 = clip(drive * mono[i]);
            const s2 = clip(s1 * gain2);
            const s3 = clip(s2 * gain3);
            const s4 = clip(s3 * gain4);
            const s5 = clip(s4 * gain5);
            const s6 = clip(s5 * gain6);
            mono[i] =
                (s6 * mix6 +
                    s5 * mix5 +
                    s4 * mix4 +
                    s3 * mix3 +
                    s2 * mix2 +
                    s1 * mix1) *
                level;
        }
        this.filterOutput(mono, sampleCount);
        this.mixOutput(mono, outputLeft, outputRight, sampleCount, outputGain);
    }

    /**
     * Writes the drive and output level words.
     * The output level compensates the drive up to a drive of 10.
     * @param drive The drive (0-127).
     * @param level The output level (0-127).
     */
    protected drive(drive: number, level: number) {
        const w = this.coefficientWords;
        const gain = Math.trunc((drive * 499) / 0x7f) + 13;
        w[0x76] = w[0x7a] = gain;
        const compensation = drive < 11 ? 169 / (gain * gain) : 169 / 2704;
        let output = Math.trunc(
            Math.fround(compensation * OUTPUT_LEVEL[level] * 512)
        );
        if (output === 0 && level !== 0) output = 1;
        w[0xa1] = output;
        this.pushCoefficients([0x76, 0x7a]);
        this.pushCoefficients([0xa1]);
    }

    /**
     * Writes the clipping stage words from the edge (clip curve) parameter.
     * @param edge The edge (0-127).
     */
    protected edge(edge: number) {
        const w = this.coefficientWords;
        const stage = 0xff - edge;
        w[0x83] = 0x2_00;
        w[0x87] = w[0x8a] = w[0x8d] = w[0x90] = stage;
        w[0x91] = 0;
        w[0x92] = w[0x93] = w[0x94] = w[0x95] = w[0x96] = 0x66;
        this.pushCoefficients([0x83, 0x87, 0x8a, 0x8d, 0x90]);
        // The input level is normalized by the stage response
        const x = stage / 128;
        const response = Math.fround(
            Math.fround((((1 + x) * x + 1) * x + 1) * x + 1) / 5
        );
        w[0x7d] = Math.trunc(Math.fround(512 / response));
        w[0x80] = 0x2_00;
        this.pushCoefficients([0x7d, 0x80]);
    }

    /**
     * Writes the dry and wet words (the system mode is always fully wet, the insertion wet is halved).
     */
    protected dryWet() {
        const w = this.coefficientWords;
        const mix = this.mixIndex();
        let wet = PAN_RIGHT[mix];
        if (this.insertion) wet >>= 1;
        w[0xad] = w[0xb1] = PAN_LEFT[mix];
        w[0xb0] = w[0xb3] = (VARIATION_GAIN * wet) >> 6;
        this.pushCoefficients([0xad, 0xb0, 0xb1, 0xb3]);
    }
}
