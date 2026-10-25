import {
    PHASE_MASK,
    RETURN_GAIN,
    STEREO_SEND_LEVEL,
    toSigned16,
    triangle,
    TRIANGLE_PEAK,
    TRIANGLE_SCALE,
    VARIATION_INPUT_LEVEL,
    XGDSPProgram,
    type XGParameterRanges,
    type XGProgramPreset
} from "../xg_dsp_program";
import { DELAY_OFFSET, LFO_RATE, PAN_LEFT, PAN_RIGHT } from "../xg_dsp_tables";

/**
 * The type-specific data of an XG chorus block effect.
 * The words are 28 coefficient words (including the output levels) followed by 10 address words.
 */
export interface XGChorusPreset extends XGProgramPreset {
    /**
     * The wet level in the variation block (/64).
     */
    variationGain: number;
}

// Program layout: which coefficient and address indices the preset words fill
const COEFFICIENT_LIST = [
    0x09, 0x0a, 0x1a, 0x25, 0x28, 0x34, 0x37, 0x3c, 0x3d, 0x3e, 0x3f, 0x40,
    0x41, 0x42, 0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x4f, 0x50, 0x5f, 0x60,
    0x61, 0x68, 0x69, 0x6a
];
const ADDRESS_LIST = [
    0x09, 0x0a, 0x0e, 0x0f, 0x13, 0x14, 0x16, 0x19, 0x1a, 0x1b
];

// Converter push lists
const LIST_LOW_LEFT = [0x4a, 0x49, 0x4b];
const LIST_LOW_RIGHT = [0x3d, 0x3c, 0x3e];
const LIST_HIGH_LEFT = [0x4d, 0x4c, 0x4e];
const LIST_HIGH_RIGHT = [0x40, 0x3f, 0x41];
const LIST_FEEDBACK = [0x4f, 0x42];
const LIST_DEPTH = [0x1a, 0x28, 0x37];
const LIST_LEFT_TAPS = [0x09, 0x0a, 0x13, 0x14];
const LIST_RIGHT_TAPS = [0x16, 0x0e, 0x0f, 0x19, 0x1a];
const LIST_DRY_WET = [0x5f, 0x60, 0x61, 0x68, 0x69, 0x6a];
// Input EQ coefficients (b1, b0, a1): left low, left high, right low, right high
const LIST_EQUALIZER = [
    0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x3c, 0x3d, 0x3e, 0x3f, 0x40, 0x41
];

/**
 * The right line base in the stereo input mode (chorus block).
 * The variation places it further away in its larger memory.
 */
const STEREO_BASE = 4096;
const VARIATION_STEREO_BASE = 16_384;

/**
 * Valid parameter ranges (min, max), the rest is 0-127.
 */
const PARAMETER_RANGES: XGParameterRanges = {
    2: [1, 127],
    5: [8, 40],
    6: [52, 76],
    7: [28, 58],
    8: [52, 76],
    14: [0, 1]
};
const FLANGER_RANGES: XGParameterRanges = {
    ...PARAMETER_RANGES,
    3: [0, 63],
    13: [4, 124]
};

/**
 * The chorus input level (the original send prescale).
 */
const INPUT_LEVEL = 103 / 32;

/**
 * The S-YXG50 chorus program, shared by chorus, celeste and flanger.
 *
 * Flow: two-band input EQ per side -> delay line(s) read by triangle LFO modulated taps with feedback.
 * In the mono input mode both sides feed one line and the right tap is a second LFO phase of it.
 * Celeste adds a third modulated tap per side.
 */
export abstract class XGChorusBase extends XGDSPProgram {
    /**
     * The delay memory length at 44.1 kHz.
     */
    public static override readonly memorySize = 32_768;
    /**
     * True when running in the variation or insertion block.
     */
    protected readonly variation: boolean;
    protected abstract override readonly preset: XGChorusPreset;
    /**
     * True for the three-tap celeste routine.
     */
    protected readonly threeTaps: boolean = false;
    protected readonly coefficientList = COEFFICIENT_LIST;
    protected readonly addressList = ADDRESS_LIST;
    /**
     * The EQ and the dry/wet levels depend on the connection (only in the variation).
     */
    protected readonly connectionParameters = [5, 9];
    protected readonly ranges = PARAMETER_RANGES;

    // LFO and the tap modulations (updated every 4 samples)
    private phase = 0;
    private step = 0;
    private rightOffset = 0;
    private thirdOffset = 0;
    private depthLeft = 0;
    private depthRight = 0;
    private depthThird = 0;
    private lfoCounter = 0;
    private intLeft = 0;
    private fracLeft = 0;
    private intRight = 0;
    private fracRight = 0;
    private intThird = 0;
    private fracThird = 0;
    /**
     * The EQ'd input of the current block.
     */
    private readonly inputLeft;
    private readonly inputRight;
    private readonly equalizerState = new Float64Array(6);

    public constructor(
        sampleRate: number,
        maxBufferSize: number,
        memory: Float32Array,
        variation: boolean
    ) {
        super(sampleRate, maxBufferSize, memory, 0);
        this.variation = variation;
        this.inputLeft = new Float32Array(maxBufferSize);
        this.inputRight = new Float32Array(maxBufferSize);
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        isInsertion: boolean
    ) {
        this.updateConnection(isInsertion);
        const memory = this.memory;
        const mask = this.mask;
        const c = this.coefficients;
        const t = this.taps;
        const feedbackL = c[0x4f],
            feedbackR = c[0x42],
            rightToLeft = c[0x50];
        const outL = c[0x60],
            outR = c[0x69],
            outThirdL = c[0x61],
            outThirdR = c[0x6a],
            dryL = c[0x5f],
            dryR = c[0x68];
        // Insertion output goes straight to the part, the system output gets the block return and pan
        const outputGain = this.variation && isInsertion ? 1 : RETURN_GAIN;
        const tReadL = t[0x09],
            tReadR = t[0x0e],
            tThirdL = t[0x13],
            tThirdR = t[0x19],
            tWriteL = t[0x1b],
            tWriteR = t[0x16];
        const { step, rightOffset, thirdOffset, depthLeft, depthRight } = this;
        const depthThird = this.depthThird;
        const threeTaps = this.threeTaps;
        // Two first-order EQ sections per side.
        // System sends are halved like the original, the insertion input is the part itself
        const eqLeft = this.inputLeft;
        const eqRight = this.inputRight;
        this.equalizeStereo(
            inputLeft,
            inputRight,
            eqLeft,
            eqRight,
            sampleCount,
            this.inputLevel *
                (this.variation && isInsertion ? 1 : STEREO_SEND_LEVEL),
            LIST_EQUALIZER,
            this.equalizerState
        );

        let { pointer, phase } = this;
        let {
            lfoCounter,
            intLeft,
            fracLeft,
            intRight,
            fracRight,
            intThird,
            fracThird
        } = this;
        for (let i = 0; i < sampleCount; i++) {
            const inL = eqLeft[i];
            const inR = eqRight[i];

            // The LFO updates every 4 samples
            if ((lfoCounter++ & 3) === 0) {
                phase = (phase + step) & PHASE_MASK;
                let v = triangle(phase) * depthLeft;
                intLeft = Math.floor(v * TRIANGLE_SCALE);
                fracLeft = (v % TRIANGLE_PEAK) * TRIANGLE_SCALE;
                v = triangle((phase - rightOffset) & PHASE_MASK) * depthRight;
                intRight = Math.floor(v * TRIANGLE_SCALE);
                fracRight = (v % TRIANGLE_PEAK) * TRIANGLE_SCALE;
                if (threeTaps) {
                    v =
                        triangle((phase - thirdOffset) & PHASE_MASK) *
                        depthThird;
                    intThird = Math.floor(v * TRIANGLE_SCALE);
                    fracThird = (v % TRIANGLE_PEAK) * TRIANGLE_SCALE;
                }
            }

            // Modulated taps with linear interpolation
            let k = (tReadL + pointer + intLeft) & mask;
            const tapL =
                (memory[(k + 1) & mask] - memory[k]) * fracLeft + memory[k];
            k = (tReadR + pointer + intRight) & mask;
            const tapR =
                (memory[(k + 1) & mask] - memory[k]) * fracRight + memory[k];
            let wetL = tapL * outL;
            let wetR = tapR * outR;
            if (threeTaps) {
                k = (tThirdL + pointer + intThird) & mask;
                wetL +=
                    ((memory[(k + 1) & mask] - memory[k]) * fracThird +
                        memory[k]) *
                    outThirdL;
                k = (tThirdR + pointer + intThird) & mask;
                wetR +=
                    ((memory[(k + 1) & mask] - memory[k]) * fracThird +
                        memory[k]) *
                    outThirdR;
            }
            memory[(tWriteL + pointer) & mask] =
                rightToLeft * inR + tapL * feedbackL + inL;
            memory[(tWriteR + pointer) & mask] = tapR * feedbackR + inR;
            outputLeft[i] = (wetL + inL * dryL) * outputGain;
            outputRight[i] = (wetR + inR * dryR) * outputGain;

            pointer = (pointer - 1) & mask;
        }
        this.pointer = pointer;
        this.phase = phase;
        this.lfoCounter = lfoCounter & 3;
        this.intLeft = intLeft;
        this.fracLeft = fracLeft;
        this.intRight = intRight;
        this.fracRight = fracRight;
        this.intThird = intThird;
        this.fracThird = fracThird;
        this.advanceFade(
            sampleCount,
            this.variation
                ? isInsertion
                    ? 1
                    : VARIATION_INPUT_LEVEL
                : INPUT_LEVEL
        );
    }

    protected override resetState() {
        this.phase = 0;
        this.lfoCounter = 0;
        this.intLeft = this.intRight = this.intThird = 0;
        this.fracLeft = this.fracRight = this.fracThird = 0;
        this.equalizerState.fill(0);
    }

    protected override pushCoefficients(
        list: ArrayLike<number>,
        count = list.length,
        offset = 0
    ) {
        super.pushCoefficients(list, count, offset);
        // The LFO runs on integers derived from the coefficients
        const inverse = this.rateInverse;
        const depthScale = Math.fround(this.rateRatio * 2048);
        const c = this.coefficients;
        for (let i = offset; i < offset + count; i++) {
            switch (list[i]) {
                case 0x09: {
                    this.step = Math.trunc(c[0x09] * inverse * 16_777_216);
                    break;
                }
                case 0x25: {
                    this.rightOffset = Math.trunc(c[0x25] * 4_194_304);
                    break;
                }
                case 0x34: {
                    this.thirdOffset = Math.trunc(c[0x34] * 4_194_304);
                    break;
                }
                case 0x1a: {
                    this.depthLeft = Math.trunc(c[0x1a] * depthScale);
                    break;
                }
                case 0x28: {
                    this.depthRight = Math.trunc(c[0x28] * depthScale);
                    break;
                }
                case 0x37: {
                    this.depthThird = Math.trunc(c[0x37] * depthScale);
                    break;
                }
            }
        }
    }

    protected convert(param: number) {
        const p = this.params;
        switch (param) {
            case 0: {
                this.coefficientWords[0x09] = LFO_RATE[p[0]];
                this.pushCoefficients([0x09]);
                break;
            }

            case 1: {
                this.depth();
                break;
            }

            case 2: {
                this.coefficientWords[0x42] = this.coefficientWords[0x4f] =
                    this.feedback();
                this.pushCoefficients(LIST_FEEDBACK);
                break;
            }

            case 3:
            case 14: {
                this.placeTaps();
                this.convert(5);
                this.convert(7);
                this.convert(9);
                break;
            }

            case 5:
            case 6: {
                // The variation drops the +3 dB low shelf in the mono insertion mode
                const shape =
                    this.variation && this.insertion && p[14] !== 1
                        ? "lowShelf"
                        : "lowShelfBoosted";
                this.designFirstOrder(shape, p[5], p[6], LIST_LOW_LEFT);
                this.designFirstOrder(shape, p[5], p[6], LIST_LOW_RIGHT);
                break;
            }

            case 7:
            case 8: {
                this.designFirstOrder("highShelf", p[7], p[8], LIST_HIGH_LEFT);
                this.designFirstOrder("highShelf", p[7], p[8], LIST_HIGH_RIGHT);
                break;
            }

            case 9: {
                // Dry/wet, only in the variation (the system mode is always fully wet)
                if (!this.variation) break;
                const mix = this.mixIndex();
                const stereo = p[14] === 1;
                let dry = PAN_LEFT[mix];
                if (stereo) dry = Math.trunc((dry * 7) / 10);
                let wet = PAN_RIGHT[mix];
                if (!stereo && this.insertion) wet = Math.trunc((wet * 7) / 10);
                wet = (this.preset.variationGain * wet) >> 6;
                const w = this.coefficientWords;
                w[0x5f] = w[0x68] = dry & 0x3_ff;
                w[0x60] = w[0x69] = w[0x61] = w[0x6a] = wet & 0x3_ff;
                this.pushCoefficients(LIST_DRY_WET);
                break;
            }
        }
    }

    /**
     * Writes and pushes the LFO depth coefficient words.
     */
    protected abstract depth(): void;

    /**
     * The feedback coefficient word.
     */
    protected abstract feedback(): number;

    /**
     * Places the write and modulated read taps from the delay offset and input mode.
     */
    private placeTaps() {
        const p = this.params;
        const a = this.addressWords;
        const delay = toSigned16(this.toAddress100us(DELAY_OFFSET[p[3]]));
        let base = this.signedAddress(0x1b);
        a[0x09] = base + 1 + delay;
        a[0x0a] = base + 2 + delay;
        a[0x13] = base + 0x41 + delay;
        a[0x14] = base + 0x42 + delay;
        if (p[14] === 1) {
            // Stereo: the right side gets its own line in the upper half
            this.coefficientWords[0x50] = 0;
            base = this.variation ? VARIATION_STEREO_BASE : STEREO_BASE;
            a[0x16] = base;
        } else {
            this.coefficientWords[0x50] = 0x2_00;
            a[0x16] = 0;
        }
        a[0x0e] = base + 1 + delay;
        a[0x0f] = base + 2 + delay;
        a[0x19] = base + 0x41 + delay;
        a[0x1a] = base + 0x42 + delay;
        this.pushCoefficients([0x50]);
        this.pushAddresses(LIST_LEFT_TAPS);
        this.pushAddresses(LIST_RIGHT_TAPS);
    }
}

/**
 * The chorus converters.
 */
export abstract class XGChorus extends XGChorusBase {
    protected readonly initOrder = [0, 1, 2, 3];

    protected depth() {
        const word = Math.trunc(((this.params[1] << 1) * 0x80) / 0x7f);
        for (const k of LIST_DEPTH) {
            this.coefficientWords[k] = word;
        }
        this.pushCoefficients(LIST_DEPTH);
    }

    protected feedback() {
        return (((this.params[2] - 0x40) * 0x5e) >> 4) & 0x3_ff;
    }
}

/**
 * The celeste: the chorus converters with a third modulated tap.
 */
export abstract class XGCeleste extends XGChorus {
    protected override readonly threeTaps = true;
}

/**
 * The flanger converters. The LFO phase difference is adjustable and the input mode is fixed per type.
 */
export abstract class XGFlanger extends XGChorusBase {
    protected readonly initOrder = [0, 1, 2, 3, 13];
    protected override readonly ranges = FLANGER_RANGES;

    public override setParameter(param: number, value: number) {
        // The input mode of a flanger cannot be changed
        if (param === 14) return;
        super.setParameter(param, value);
    }

    protected override convert(param: number) {
        if (param === 13) {
            this.coefficientWords[0x25] = this.phaseWord(this.params[13]);
            this.pushCoefficients([0x25]);
            return;
        }
        super.convert(param);
    }

    protected depth() {
        const word = Math.trunc((this.params[1] * 0x80) / 0x7f);
        this.coefficientWords[0x1a] = this.coefficientWords[0x28] = word;
        this.pushCoefficients(LIST_DEPTH, 2);
    }

    protected feedback() {
        return this.feedbackWord(this.params[2]);
    }
}
