/**
 * The raw stereo DSP for a single Roland GS insertion (EFX) type.
 *
 * The insertion block ({@link DefaultGSInsertion}) does the mixing and the send levels.
 *
 * Used only in the default implementation.
 */
export interface DefaultGSInsertionProcessor {
    /**
     * The EFX type of this processor, stored as `MSB << 8 | LSB`.
     * For example `0x30`, `0x10` is `0x3010`.
     */
    readonly type: number;

    /**
     * Resets the params to their default values.
     */
    reset(): void;

    /**
     * Sets an EFX parameter.
     * @param parameter The parameter number (0-based, 0-19). EFX parameter 1 is 0.
     * @param value The new value (0-127).
     */
    setParameter(parameter: number, value: number): void;

    /**
     * Process the effect and **OVERWRITES** it to the output.
     * @param inputLeft The left input buffer to process. It always starts at index 0.
     * @param inputRight The right input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer. It always starts at index 0.
     * @param outputRight The right output buffer. It always starts at index 0.
     * @param sampleCount The amount of samples to process.
     */
    process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ): void;
}

/**
 * Constructor for a GS insertion processor.
 */
export type DefaultGSInsertionProcessorConstructor = new (
    sampleRate: number,
    maxBufferSize: number
) => DefaultGSInsertionProcessor;
