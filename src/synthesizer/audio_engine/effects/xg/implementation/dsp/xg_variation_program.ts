import {
    RETURN_GAIN,
    STEREO_SEND_LEVEL,
    VARIATION_INPUT_LEVEL,
    XGDSPProgram,
    type XGProgramPreset
} from "./xg_dsp_program";

/**
 * The type-specific data of a variation-only XG effect.
 * The words are the 79 coefficient words followed by the 27 address words of the program.
 */
export type XGVariationPreset = XGProgramPreset;

// Program layout: which coefficient and address indices the preset words fill
const COEFFICIENT_LIST = Array.from({ length: 79 }, (_, i) => 0x6d + i);
const ADDRESS_LIST = Array.from({ length: 27 }, (_, i) => 0x24 + i);

/**
 * The largest number of coefficients a category never writes.
 */
const MAX_UNWRITTEN = 32;

/**
 * The original feeds an inserted part to the variation at 24/11 of its dry level
 * and mixes the result back at 235/512, which matters for the nonlinear programs.
 */
const INSERTION_INPUT_LEVEL = 24 / 11;
const INSERTION_OUTPUT_GAIN = 235 / 512;

/**
 * The base for the variation-only programs.
 * It mirrors the DLL's variation layout (coefficients 0x6d-0xbb, taps 0x24-0x3e).
 * Each variation category (see the category bases) adds its own input stage and coefficient rules.
 * Insertion output goes straight to the part, system output gets the block return and pan.
 */
export abstract class XGVariationProgram extends XGDSPProgram {
    /**
     * The variation delay memory size at 44.1 kHz.
     */
    public static override readonly memorySize: number = 131_072;
    protected readonly coefficientList = COEFFICIENT_LIST;
    protected readonly addressList = ADDRESS_LIST;
    /**
     * The LFO phase.
     */
    protected lfoPhase = 0;
    /**
     * The input of the current block, after the category's input stage.
     */
    protected readonly inputLeft;
    protected readonly inputRight;
    /**
     * The coefficients the category's rules never write, the DSP keeps their previous values.
     */
    protected readonly unwrittenCoefficients: readonly number[] = [];
    private readonly keptCoefficients = new Float32Array(MAX_UNWRITTEN);

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
        super(sampleRate, maxBufferSize, memory, category);
        this.inputLeft = new Float32Array(maxBufferSize);
        this.inputRight = new Float32Array(maxBufferSize);
    }

    public override reset() {
        this.lfoPhase = 0;
        super.reset();
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
        // System sends are halved like the original
        this.prepareInput(
            inputLeft,
            inputRight,
            sampleCount,
            this.inputLevel *
                (isInsertion ? INSERTION_INPUT_LEVEL : STEREO_SEND_LEVEL)
        );
        this.render(
            outputLeft,
            outputRight,
            sampleCount,
            isInsertion ? INSERTION_OUTPUT_GAIN : RETURN_GAIN
        );
        this.advanceFade(sampleCount, isInsertion ? 1 : VARIATION_INPUT_LEVEL);
    }

    protected override pushCoefficients(
        list: ArrayLike<number>,
        count = list.length,
        offset = 0
    ) {
        const c = this.coefficients;
        const unwritten = this.unwrittenCoefficients;
        const kept = this.keptCoefficients;
        for (let i = 0; i < unwritten.length; i++) {
            kept[i] = c[unwritten[i]];
        }
        super.pushCoefficients(list, count, offset);
        for (let i = 0; i < unwritten.length; i++) {
            c[unwritten[i]] = kept[i];
        }
    }

    /**
     * Fills {@link inputLeft} and {@link inputRight} from the block input.
     * Without a shared input stage, the input is only scaled.
     * @param inputLeft The left input.
     * @param inputRight The right input.
     * @param sampleCount The number of samples.
     * @param gain The input level.
     */
    protected prepareInput(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        sampleCount: number,
        gain: number
    ) {
        for (let i = 0; i < sampleCount; i++) {
            this.inputLeft[i] = inputLeft[i] * gain;
            this.inputRight[i] = inputRight[i] * gain;
        }
    }

    /**
     * Runs the routine on the prepared input ({@link inputLeft}, {@link inputRight}).
     * @param outputLeft The left output, overwritten.
     * @param outputRight The right output, overwritten.
     * @param sampleCount The number of samples.
     * @param outputGain The output scale for the current connection.
     */
    protected abstract render(
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        outputGain: number
    ): void;
}
