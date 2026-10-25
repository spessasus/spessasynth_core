import type { DefaultXGEffectProcessor } from "./effect_processor";
import {
    COEFFICIENT_MODES,
    DENSITY_MASK,
    DENSITY_TABLE,
    FILTER_CUT,
    FILTER_FREQUENCIES,
    FILTER_GAIN
} from "./xg_dsp_tables";

/**
 * The sample rate the XG DSP programs are designed for.
 */
export const XG_DSP_SAMPLE_RATE = 44_100;

/**
 * The number of coefficient words and processing coefficients.
 */
const COEFFICIENT_COUNT = 192;

/**
 * The number of address words and delay taps.
 */
const ADDRESS_COUNT = 64;

/**
 * Seconds between the control ticks that drive the input fade-in after a type change.
 */
const CONTROL_TICK = 0.01;

/**
 * The input level step per control tick during the fade-in.
 */
const FADE_STEP = 1 / 32;

/**
 * The extra gain of the boosted low shelf.
 */
const BOOST = Math.fround(1.4142);

/**
 * The first-order filter shapes of the XG DSP filter designer.
 * The boosted low shelf has an extra 3 dB of gain (the chorus input EQ).
 */
export type XGFilterShape =
    | "lowPass"
    | "highPass"
    | "lowShelf"
    | "lowShelfBoosted"
    | "highShelf"
    | "gain";

/**
 * The second-order filter shapes of the XG DSP filter designer.
 */
export type XGBiquadShape = "peaking" | XGFilterShape;

/**
 * The level of a voice's chorus and variation send relative to its dry signal at full send.
 * The original sends half of the (panned) voice to these stereo effect inputs,
 * while the synthesizer sends the full panned voice.
 */
export const STEREO_SEND_LEVEL = 0.5;

/**
 * The variation input level in the system mode (1 in the insertion mode).
 */
export const VARIATION_INPUT_LEVEL = 181 / 64;

/**
 * The original chorus and variation return at its default (return 64, center pan) is 182 / 512.
 * The center pan is divided out because the block applies its own pan.
 */
export const RETURN_GAIN = 182 / 512 / Math.SQRT1_2;

/**
 * The 23-bit LFO phase range.
 */
export const PHASE_MASK = 0x7f_ff_ff;
/**
 * The peak of a folded LFO phase (22 bits).
 */
export const TRIANGLE_PEAK = 2 ** 22;
/**
 * Scales a folded LFO phase (0 to 2^22) to 0-1.
 */
export const TRIANGLE_SCALE = 1 / TRIANGLE_PEAK;

/**
 * Folds an LFO phase into a triangle (0 to 2^22).
 * @param u The phase.
 */
export const triangle = (u: number) => u ^ (u >> 22 ? PHASE_MASK : 0);

/**
 * Reads a 16-bit word as a signed value.
 * @param value The word.
 */
export const toSigned16 = (value: number) => (value << 16) >> 16;

/**
 * The delay memory length a processor needs (a power of two).
 * @param sampleRate The sample rate, in Hertz.
 * @param size The required length at 44.1 kHz.
 */
export function getMemorySize(sampleRate: number, size: number) {
    const length = Math.ceil((size * sampleRate) / XG_DSP_SAMPLE_RATE);
    let powerOfTwo = 1;
    while (powerOfTwo < length) powerOfTwo <<= 1;
    return powerOfTwo;
}

const chopFloat = new Float32Array(1);
const chopBits = new Int32Array(chopFloat.buffer);

/**
 * Rounds toward zero to float32.
 * The original renders with the x87 FPU in 24-bit precision and truncating rounding,
 * which matters for slow control-rate accumulators (LFO smoothing).
 * @param value The value to round.
 */
export function chop32(value: number) {
    chopFloat[0] = value;
    if (Math.abs(chopFloat[0]) > Math.abs(value)) {
        // One step toward zero (the bits are sign and magnitude)
        chopBits[0]--;
    }
    return chopFloat[0];
}

/**
 * Valid parameter ranges (min, max) by parameter number.
 */
export type XGParameterRanges = Partial<
    Record<number, readonly [number, number]>
>;

/**
 * The type-specific data shared by all XG DSP programs.
 */
export interface XGProgramPreset {
    /**
     * The coefficient words followed by the address words of the program.
     */
    words: readonly number[];
    /**
     * The 16 default parameter values.
     */
    defaults: readonly number[];
}

/**
 * Converts an XG DSP coefficient word into a float.
 * @param word The 10-bit coefficient word.
 * @param mode 0: signed /512, 1: signed /128, 2: 3-bit exponent and 7-bit mantissa.
 */
function wordToFloat(word: number, mode: number) {
    const w = word & 0x3_ff;
    if (mode === 2) {
        const exponent = w >> 7;
        const mantissa = w & 0x7f;
        return exponent === 7
            ? mantissa / 128
            : Math.fround(
                  (1 << exponent) * 2.384_185_791_015_625e-7 * mantissa
              );
    }
    const signed = w > 0x2_00 ? w - 0x4_00 : w;
    return mode === 1 ? signed / 128 : signed / 512;
}

/**
 * Rounds a scaled coefficient half away from zero, like the DLL's biased truncation.
 * @param value The exact scaled value.
 */
export function biasedRound(value: number) {
    return Math.fround(value >= 0 ? value + 0.5 : value - 0.5);
}

/**
 * The base for the XG DSP programs (S-YXG50 model).
 *
 * The parameter converters write 16-bit coefficient and address words into word RAMs.
 * Only the words named in each converter's push list reach the DSP, exactly like the original.
 * Address words are in 44.1 kHz samples and get scaled to the actual sample rate.
 *
 * The delay memory belongs to the effect block and is shared by all of its processors,
 * as only one of them runs at a time. Each processor uses the start of it, sized by {@link memorySize}.
 *
 * Converter indices from 16 up are internal converters (such as connection-dependent input levels),
 * {@link setParameter} never reaches them.
 */
export abstract class XGDSPProgram implements DefaultXGEffectProcessor {
    /**
     * The delay memory length the program needs at 44.1 kHz.
     */
    public static readonly memorySize: number = 0;

    public abstract readonly type: number;

    /**
     * The raw XG parameter values.
     */
    protected readonly params = new Int16Array(16);
    /**
     * The coefficient word RAM.
     */
    protected readonly coefficientWords = new Uint16Array(COEFFICIENT_COUNT);
    /**
     * The address word RAM.
     */
    protected readonly addressWords = new Uint16Array(ADDRESS_COUNT);
    /**
     * The coefficients visible to the DSP.
     */
    protected readonly coefficients = new Float32Array(COEFFICIENT_COUNT);
    /**
     * The delay taps visible to the DSP, in samples.
     */
    protected readonly taps = new Int32Array(ADDRESS_COUNT);
    protected readonly sampleRate;
    protected readonly maxBufferSize;
    /**
     * The sample rate relative to 44.1 kHz and its inverse, in float32 like the original.
     */
    protected readonly rateRatio;
    protected readonly rateInverse;
    /**
     * The delay memory of this program (the start of the block's shared memory).
     */
    protected readonly memory;
    protected readonly mask;
    /**
     * The delay memory write position, moving backwards.
     */
    protected pointer = 0;
    /**
     * The current input level, ramped up to the target level after a type change.
     */
    protected inputLevel = 0;
    /**
     * The insertion mode the converters last ran for.
     */
    protected insertion = false;

    /**
     * When false, the converters update the word RAMs without pushing them to the DSP.
     */
    protected pushEnabled = true;
    /**
     * The variation category selecting the coefficient formats.
     */
    protected readonly category;
    protected abstract readonly preset: XGProgramPreset;
    /**
     * Coefficient indices of the preset words.
     */
    protected abstract readonly coefficientList: readonly number[];
    /**
     * Address indices of the preset words.
     */
    protected abstract readonly addressList: readonly number[];
    /**
     * The converters run when a type is loaded.
     */
    protected abstract readonly initOrder: readonly number[];
    /**
     * The converters run again when the connection (system or insertion) changes.
     */
    protected abstract readonly connectionParameters: readonly number[];
    /**
     * Valid parameter ranges (min, max), the rest is 0-127.
     */
    protected abstract readonly ranges: XGParameterRanges;
    /**
     * The first-order filter designer output (b0, b1, a1).
     */
    private readonly firstOrder = new Float64Array(3);
    private readonly addressScale;
    private readonly tickLength;
    private tickCounter = 0;

    /**
     * Creates the program.
     * @param sampleRate The sample rate, in Hertz.
     * @param maxBufferSize The maximum buffer size.
     * @param memory The delay memory of the effect block.
     * @param category The variation category selecting the coefficient formats.
     */
    protected constructor(
        sampleRate: number,
        maxBufferSize: number,
        memory: Float32Array,
        category: number
    ) {
        this.sampleRate = sampleRate;
        this.maxBufferSize = maxBufferSize;
        this.category = category;
        this.addressScale = sampleRate / XG_DSP_SAMPLE_RATE;
        this.rateRatio = Math.fround(sampleRate / XG_DSP_SAMPLE_RATE);
        this.rateInverse = Math.fround(1 / this.rateRatio);
        this.tickLength = Math.max(1, Math.round(sampleRate * CONTROL_TICK));
        const length = getMemorySize(
            sampleRate,
            (this.constructor as typeof XGDSPProgram).memorySize
        );
        if (memory.length < length) {
            throw new Error(
                `The delay memory is too short: ${memory.length} < ${length}`
            );
        }
        this.memory = memory.subarray(0, length);
        this.mask = length - 1;
    }

    public setParameter(param: number, value: number) {
        if (param < 0 || param > 15) return;
        this.params[param] = this.clampParameter(param, value);
        this.convert(param);
    }

    public getSnapshot() {
        return this.params.slice();
    }

    /**
     * Clears the delay memory and the routine state, then loads the type preset and the defaults.
     * The converters first run on the defaults without pushing, the whole program is pushed,
     * then every parameter is sent again in order, mirroring a type change in the original.
     */
    public reset() {
        this.memory.fill(0);
        this.pointer = 0;
        this.resetState();

        const { words, defaults } = this.preset;
        const coefficientList = this.coefficientList;
        const addressList = this.addressList;
        this.coefficientWords.fill(0);
        this.addressWords.fill(0);
        this.coefficients.fill(0);
        this.taps.fill(0);
        for (let i = 0; i < coefficientList.length; i++) {
            this.coefficientWords[coefficientList[i]] = words[i];
        }
        for (let i = 0; i < addressList.length; i++) {
            this.addressWords[addressList[i]] =
                words[coefficientList.length + i];
        }
        for (let i = 0; i < 16; i++) {
            this.params[i] = defaults[i];
        }
        this.pushEnabled = false;
        for (const param of this.initOrder) {
            this.convert(param);
        }
        this.pushEnabled = true;
        this.pushAddresses(addressList);
        this.pushCoefficients(coefficientList);
        for (let i = 0; i < 16; i++) {
            this.setParameter(i, defaults[i]);
        }
        this.inputLevel = 0;
        this.tickCounter = 0;
    }

    public abstract process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        isInsertion: boolean
    ): void;

    /**
     * Clears the routine's own state on reset.
     */
    protected resetState() {
        // No state by default
    }

    /**
     * Runs the connection converters when the connection (system or insertion) changes.
     * @param isInsertion The current connection.
     */
    protected updateConnection(isInsertion: boolean) {
        if (isInsertion === this.insertion) return;
        this.insertion = isInsertion;
        for (const param of this.connectionParameters) {
            this.convert(param);
        }
    }

    /**
     * Clamps a raw parameter value to its valid range.
     * @param param The parameter number.
     * @param value The raw value.
     */
    protected clampParameter(param: number, value: number) {
        const [min, max] = this.ranges[param] ?? [0, 127];
        return Math.min(max, Math.max(min, value));
    }

    /**
     * Runs the converter for the given parameter.
     * @param param The parameter number.
     */
    protected abstract convert(param: number): void;

    /**
     * Copies coefficient words to the DSP.
     * @param list The coefficient indices.
     * @param count How many indices of the list to push (defaults to all).
     * @param offset The first list index.
     */
    protected pushCoefficients(
        list: ArrayLike<number>,
        count = list.length,
        offset = 0
    ) {
        if (!this.pushEnabled) return;
        const modeOffset = this.category * COEFFICIENT_COUNT;
        for (let i = offset; i < offset + count; i++) {
            const k = list[i];
            const mode = COEFFICIENT_MODES[modeOffset + k];
            if (mode !== -1) {
                this.coefficients[k] = wordToFloat(
                    this.coefficientWords[k],
                    mode
                );
            }
        }
    }

    /**
     * Converts a coefficient word to its DSP value, without the category processing rules.
     * @param index The coefficient index.
     */
    protected rawCoefficient(index: number) {
        const mode =
            COEFFICIENT_MODES[this.category * COEFFICIENT_COUNT + index];
        return mode === -1
            ? 0
            : wordToFloat(this.coefficientWords[index], mode);
    }

    /**
     * Copies address words to the DSP as delay taps.
     * @param list The address indices.
     * @param count How many indices of the list to push (defaults to all).
     * @param offset The first list index.
     */
    protected pushAddresses(
        list: ArrayLike<number>,
        count = list.length,
        offset = 0
    ) {
        if (!this.pushEnabled) return;
        for (let i = offset; i < offset + count; i++) {
            const k = list[i];
            // The original only stores some address slots, depending on the variation category
            if (k === 0x0a || k === 0x0f || k === 0x14 || k === 0x1a) continue;
            if (k >= 0x24 && k <= 0x3e) {
                const written =
                    this.category === 0
                        ? k === 0x28 ||
                          k === 0x2d ||
                          k === 0x33 ||
                          k === 0x38 ||
                          k === 0x3a ||
                          k === 0x3b
                        : this.category >= 2;
                if (!written) continue;
            }
            this.taps[k] = Math.trunc(this.addressWords[k] * this.addressScale);
        }
    }

    /**
     * The Dry/Wet parameter in effect: the system mode is always fully wet.
     */
    protected mixIndex() {
        return this.insertion ? this.params[9] : 127;
    }

    /**
     * The feedback level coefficient word.
     * @param level The feedback level parameter (1-127, 64 is zero).
     */
    protected feedbackWord(level: number) {
        return (((level - 0x40) * 0x7d) >> 4) & 0x3_ff;
    }

    /**
     * The LFO phase offset word.
     * @param value The phase difference parameter (64 is zero).
     */
    protected phaseWord(value: number) {
        return Math.trunc(((0x40 - value) * 0x2_00) / 0x3c) & 0x3_ff;
    }

    /**
     * Converts a 10 microsecond length into 44.1 kHz address units.
     * @param value The length.
     */
    protected toAddress10us(value: number) {
        return ((value & 0xff_ff) * 0x70_e5) >> 16;
    }

    /**
     * Converts a 0.1 millisecond length into 44.1 kHz address units.
     * @param value The length.
     */
    protected toAddress100us(value: number) {
        return ((value & 0xff_ff) * 0x46_8f) >> 12;
    }

    /**
     * Reads an address word as a signed 16-bit value.
     * @param index The address index.
     */
    protected signedAddress(index: number) {
        return toSigned16(this.addressWords[index]);
    }

    /**
     * Writes the four density allpass lengths and coefficients (reverb, early reflections and karaoke).
     * @param density The density parameter (0-3, more lines get diffused as it rises).
     * @param diffusion The diffusion parameter, the fourth line reuses the third length when it is 0.
     * @param row The density table row.
     * @param doubled The bit mask of lines with doubled input coefficients.
     * @param coefficientList The four coefficient indices of each line.
     * @param addressList The base and density tap address indices of each line.
     */
    protected densityAllpasses(
        density: number,
        diffusion: number,
        row: number,
        doubled: number,
        coefficientList: readonly number[],
        addressList: readonly number[]
    ) {
        let bits = DENSITY_MASK[Math.min(3, density)];
        const start = row * 8;
        const a = this.addressWords;
        const w = this.coefficientWords;
        for (let line = 0; line < 4; line++) {
            const lengthIndex =
                line === 3 && diffusion === 0
                    ? start + line * 2 - 2
                    : start + line * 2;
            let length = toSigned16(
                this.toAddress10us(DENSITY_TABLE[lengthIndex])
            );
            if (length === 0) length = 1;
            a[addressList[line * 2 + 1]] =
                length + this.signedAddress(addressList[line * 2]);

            let u6 = DENSITY_TABLE[start + line * 2 + 1];
            let c0: number, c1: number, c2: number;
            if ((bits & 1) === 0) {
                c0 = 0x80;
                c1 = 0;
                c2 = 0;
                u6 = 0;
            } else {
                c0 = (-toSigned16(u6) >> 2) & 0xff_ff;
                c1 = (0x80 - c0) & 0xff_ff;
                c2 = (0x2_00 - u6) & 0xff_ff;
            }
            if (doubled & 1) {
                c0 = (c0 << 1) & 0xff_ff;
                c1 = (c1 << 1) & 0xff_ff;
            }
            bits >>= 1;
            doubled >>= 1;
            const k = line * 4;
            w[coefficientList[k]] = c0 & 0x3_ff;
            w[coefficientList[k + 1]] = c1 & 0x3_ff;
            w[coefficientList[k + 2]] = c2 & 0x3_ff;
            w[coefficientList[k + 3]] = u6 & 0x3_ff;
        }
    }

    /**
     * Runs a stereo input EQ: per side, a first-order low section followed by a first-order high section.
     * @param inputLeft The left input.
     * @param inputRight The right input.
     * @param outputLeft The left output, overwritten.
     * @param outputRight The right output, overwritten.
     * @param sampleCount The number of samples.
     * @param gain The input level.
     * @param list The coefficient indices (b1, b0, a1) of the left low, left high, right low and right high sections.
     * @param state The filter state (low input, low output, high output of each side).
     */
    protected equalizeStereo(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        gain: number,
        list: readonly number[],
        state: Float64Array
    ) {
        const c = this.coefficients;
        const lb1L = c[list[0]],
            lb0L = c[list[1]],
            la1L = c[list[2]],
            hb1L = c[list[3]],
            hb0L = c[list[4]],
            ha1L = c[list[5]];
        const lb1R = c[list[6]],
            lb0R = c[list[7]],
            la1R = c[list[8]],
            hb1R = c[list[9]],
            hb0R = c[list[10]],
            ha1R = c[list[11]];
        let lowXL = state[0],
            lowYL = state[1],
            highYL = state[2],
            lowXR = state[3],
            lowYR = state[4],
            highYR = state[5];
        for (let i = 0; i < sampleCount; i++) {
            let x = inputLeft[i] * gain;
            let low = lb1L * lowXL + lb0L * x + la1L * lowYL;
            highYL = low * hb0L + hb1L * lowYL + ha1L * highYL;
            lowXL = x;
            lowYL = low;
            outputLeft[i] = highYL;
            x = inputRight[i] * gain;
            low = lb1R * lowXR + lb0R * x + la1R * lowYR;
            highYR = low * hb0R + hb1R * lowYR + ha1R * highYR;
            lowXR = x;
            lowYR = low;
            outputRight[i] = highYR;
        }
        state[0] = lowXL;
        state[1] = lowYL;
        state[2] = highYL;
        state[3] = lowXR;
        state[4] = lowYR;
        state[5] = highYR;
    }

    /**
     * Designs a first-order filter into three coefficient words (b0, b1, a1) and pushes them.
     * @param shape The filter shape.
     * @param frequency The XG filter frequency index.
     * @param gainIndex The filter gain index (64 is unity).
     * @param list The coefficient indices for b0, b1 and a1.
     * @param offset The first list index.
     */
    protected designFirstOrder(
        shape: XGFilterShape,
        frequency: number,
        gainIndex: number,
        list: ArrayLike<number>,
        offset = 0
    ) {
        const f = this.firstOrder;
        this.firstOrderCoefficients(
            shape,
            this.prewarp(frequency),
            gainIndex & 0x7f
        );
        const b0 = f[0],
            b1 = f[1],
            a1 = f[2];

        // Round b0 and b1, keeping their summed rounding error within half a step
        const e0 = Math.fround(b0 * 128);
        const e1 = Math.fround(b1 * 128);
        let r0 = biasedRound(e0);
        let r1 = biasedRound(e1);
        const err0 = Math.trunc(r0) - e0;
        const err1 = Math.trunc(r1) - e1;
        const sum = err0 + err1;
        if (sum >= -0.5) {
            if (sum > 0.5) {
                if (err0 <= err1) r1--;
                else r0--;
            }
        } else if (err0 > err1) r1++;
        else r0++;
        const a = biasedRound(Math.fround(a1 * 512));

        this.coefficientWords[list[offset]] = Math.trunc(r0) & 0x3_ff;
        this.coefficientWords[list[offset + 1]] = Math.trunc(r1) & 0x3_ff;
        this.coefficientWords[list[offset + 2]] = Math.trunc(a) & 0x3_ff;
        this.pushCoefficients(list, 3, offset);
    }

    /**
     * Designs a second-order filter into five coefficient words (b0, b1, b2, a1, a2) and pushes them.
     * @param shape The filter shape.
     * @param frequency The XG filter frequency index.
     * @param gainIndex The filter gain index (64 is unity).
     * @param width The filter width (Q * 10).
     * @param list The coefficient indices for b0, b1, b2, a1 and a2.
     */
    protected designSecondOrder(
        shape: XGBiquadShape,
        frequency: number,
        gainIndex: number,
        width: number,
        list: ArrayLike<number>
    ) {
        const w = this.prewarp(frequency);
        const g = gainIndex & 0x7f;
        if (shape !== "peaking") {
            // A first-order shape in the second-order section
            const f = this.firstOrder;
            this.firstOrderCoefficients(shape, w, g);
            this.pushSecondOrder(f[0], f[1], 0, f[2], 0, list);
            return;
        }
        const w2 = Math.fround(w * w);
        let q = Math.fround(Math.fround(w * 10) / (width & 0xff));
        let den: number, b0: number, b2: number;
        // Peaking: a cut widens the poles, a boost widens the zeros
        if (g < 0x40) {
            den = Math.fround(
                Math.fround(w2 + Math.fround(q * FILTER_CUT[g])) + 1
            );
            b0 = Math.fround(Math.fround(Math.fround(w2 + q) + 1) / den);
            b2 = Math.fround(Math.fround(Math.fround(1 - q) + w2) / den);
            q = Math.fround(q * FILTER_CUT[g]);
        } else {
            const zero = Math.fround(q * FILTER_GAIN[g]);
            den = Math.fround(Math.fround(w2 + q) + 1);
            b0 = Math.fround(Math.fround(Math.fround(w2 + zero) + 1) / den);
            b2 = Math.fround(Math.fround(Math.fround(1 - zero) + w2) / den);
        }
        const b1 = Math.fround(Math.fround(Math.fround(w2 + w2) - 2) / den);
        const a1 = -b1;
        const a2 = Math.fround(Math.fround(Math.fround(q - 1) - w2) / den);
        this.pushSecondOrder(b0, b1, b2, a1, a2, list);
    }

    /**
     * Advances the post type change input fade-in by the given number of samples.
     * @param sampleCount The samples processed.
     * @param target The input level to ramp to (the original send prescale of the block).
     */
    protected advanceFade(sampleCount: number, target: number) {
        if (this.inputLevel >= target) {
            this.inputLevel = target;
            return;
        }
        this.tickCounter += sampleCount;
        while (
            this.tickCounter >= this.tickLength &&
            this.inputLevel < target
        ) {
            this.tickCounter -= this.tickLength;
            this.inputLevel = Math.min(target, this.inputLevel + FADE_STEP);
        }
    }

    /**
     * The prewarped frequency (tan of pi * f / fs) of an XG filter frequency index.
     * @param frequency The XG filter frequency index.
     */
    private prewarp(frequency: number) {
        const hz = Math.min(
            FILTER_FREQUENCIES[frequency & 0xff] ?? 0,
            this.sampleRate * 0.49
        );
        return Math.fround(Math.tan((Math.PI * hz) / this.sampleRate));
    }

    /**
     * Computes the coefficients (b0, b1, a1) of a first-order shape into {@link firstOrder}.
     * @param shape The filter shape.
     * @param w The prewarped frequency (tan of pi * f / fs).
     * @param g The filter gain index (64 is unity).
     */
    private firstOrderCoefficients(shape: XGFilterShape, w: number, g: number) {
        let b0: number, b1: number, a1: number;
        switch (shape) {
            case "lowPass":
            case "highPass": {
                const den = Math.fround(w + 1);
                if (shape === "highPass") {
                    b0 = Math.fround(FILTER_GAIN[g] / den);
                    b1 = -b0;
                } else {
                    b0 = Math.fround(Math.fround(FILTER_GAIN[g] * w) / den);
                    b1 = b0;
                }
                a1 = Math.fround(Math.fround(1 - w) / den);
                break;
            }

            case "lowShelf":
            case "lowShelfBoosted": {
                const zero = g < 0x40 ? w : Math.fround(w * FILTER_GAIN[g]);
                const pole = g < 0x40 ? Math.fround(w * FILTER_CUT[g]) : w;
                const den = Math.fround(pole + 1);
                b0 = Math.fround(Math.fround(zero + 1) / den);
                b1 = Math.fround(Math.fround(zero - 1) / den);
                a1 = Math.fround(Math.fround(1 - pole) / den);
                if (shape === "lowShelfBoosted") {
                    b0 = Math.fround(b0 * BOOST);
                    b1 = Math.fround(b1 * BOOST);
                }
                break;
            }

            case "gain": {
                b0 = FILTER_GAIN[g];
                b1 = 0;
                a1 = 0;
                break;
            }

            case "highShelf": {
                const zero = g < 0x40 ? 1 : FILTER_GAIN[g];
                const pole = g < 0x40 ? FILTER_CUT[g] : 1;
                const den = Math.fround(pole + w);
                b0 = Math.fround(Math.fround(zero + w) / den);
                b1 = Math.fround(Math.fround(w - zero) / den);
                a1 = Math.fround(Math.fround(pole - w) / den);
                break;
            }
        }
        const f = this.firstOrder;
        f[0] = b0;
        f[1] = b1;
        f[2] = a1;
    }

    /**
     * Rounds second-order coefficients into words and pushes them.
     * The summed rounding errors of the zeros and of the poles are kept within half a step.
     * @param b0 The coefficient b0.
     * @param b1 The coefficient b1.
     * @param b2 The coefficient b2.
     * @param a1 The coefficient a1.
     * @param a2 The coefficient a2.
     * @param list The coefficient indices for b0, b1, b2, a1 and a2.
     */
    private pushSecondOrder(
        b0: number,
        b1: number,
        b2: number,
        a1: number,
        a2: number,
        list: ArrayLike<number>
    ) {
        const x0 = Math.fround(b0 * 128),
            x1 = Math.fround(b1 * 128),
            x2 = Math.fround(b2 * 128),
            x3 = Math.fround(a1 * 128),
            x4 = Math.fround(a2 * 128);
        let r0 = biasedRound(x0),
            r1 = biasedRound(x1),
            r2 = biasedRound(x2),
            r3 = biasedRound(x3),
            r4 = biasedRound(x4);
        const e0 = Math.trunc(r0) - x0,
            e1 = Math.trunc(r1) - x1,
            e2 = Math.trunc(r2) - x2,
            e3 = Math.trunc(r3) - x3,
            e4 = Math.trunc(r4) - x4;
        const sum = e1 + e0 + e2;
        if (sum >= -0.5) {
            if (sum > 0.5) {
                if (e1 <= e2) {
                    if (e0 <= e2) r2--;
                    else r0--;
                } else if (e0 <= e1) r1--;
                else r0--;
            }
        } else if (e1 > e2) {
            if (e0 > e2) r2++;
            else r0++;
        } else if (e0 > e1) r1++;
        else r0++;
        const poles = e3 + e4;
        if (poles >= -0.5) {
            if (poles > 0.5) {
                if (e3 <= e4) r4--;
                else r3--;
            }
        } else if (e3 > e4) r4++;
        else r3++;
        const w = this.coefficientWords;
        w[list[0]] = Math.trunc(r0) & 0x3_ff;
        w[list[1]] = Math.trunc(r1) & 0x3_ff;
        w[list[2]] = Math.trunc(r2) & 0x3_ff;
        w[list[3]] = Math.trunc(r3) & 0x3_ff;
        w[list[4]] = Math.trunc(r4) & 0x3_ff;
        this.pushCoefficients(list, 5);
    }
}
