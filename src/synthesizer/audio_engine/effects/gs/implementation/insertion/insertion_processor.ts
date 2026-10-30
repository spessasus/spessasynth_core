/**
 * The raw processor for a single Roland GS insertion (EFX) type.
 *
 * Used only in the default implementation, {@link DefaultGSInsertion}.
 */
export interface DefaultGSInsertionProcessor {
    /**
     * The EFX type of this processor, stored as `MSB << 8 | LSB`.
     * For example `0x30`, `0x10` is `0x3010`.
     */
    readonly type: number;

    /**
     * `0-1` (floating point, gain correction applied)
     *
     * The amount of insertion sound sent to the reverb. Set by the insertion block.
     */
    sendLevelToReverb: number;

    /**
     * `0-1` (floating point, gain correction applied)
     *
     * The amount of insertion sound sent to the chorus. Set by the insertion block.
     */
    sendLevelToChorus: number;

    /**
     * `0-1` (floating point, gain correction applied)
     *
     * The amount of insertion sound sent to the delay. Set by the insertion block.
     */
    sendLevelToDelay: number;

    /**
     * Resets the params to their default values.
     * This does not need to reset send levels.
     */
    reset(): void;

    /**
     * Sets an EFX parameter.
     * @param parameter The parameter number (0x03-0x16).
     * @param value The new value (0-127).
     */
    setParameter(parameter: number, value: number): void;

    /**
     * Process the effect and **adds** it to the output.
     * @param inputLeft The left input buffer to process. It always starts at index 0.
     * @param inputRight The right input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param outputReverb The mono input for reverb. It always starts at index 0.
     * @param outputChorus The mono input for chorus. It always starts at index 0.
     * @param outputDelay The mono input for delay. It always starts at index 0.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix.
     */
    process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        outputReverb: Float32Array,
        outputChorus: Float32Array,
        outputDelay: Float32Array,
        startIndex: number,
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
