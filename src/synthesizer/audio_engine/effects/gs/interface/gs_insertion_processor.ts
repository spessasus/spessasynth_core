/**
 * Represents a GS-compatible Insertion EFX processor.
 *
 * @group Synthesizer.GS Effects
 */
export interface GSInsertionProcessor {
    /**
     * The EFX type of this processor, stored as `MSB << 8 | LSB`.
     * For example `0x30`, `0x10` is `0x3010`.
     */
    readonly type: number;

    /**
     * `0-1` (floating point)
     *
     * This parameter sets the amount of insertion sound that will be sent to the reverb.
     * Higher values result in more sound being sent.
     */
    sendLevelToReverb: number;

    /**
     * `0-1` (floating point)
     *
     * This parameter sets the amount of insertion sound that will be sent to the chorus.
     * Higher values result in more sound being sent.
     */
    sendLevelToChorus: number;

    /**
     * `0-1` (floating point)
     *
     * This parameter sets the amount of insertion sound that will be sent to the delay.
     * Higher values result in more sound being sent.
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
     * @param sampleCount The amount of samples to mix. This will never be larger than {@link SynthProcessorOptions.maxBufferSize} of the parent {@link SpessaSynthProcessor} instance. */
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
 * Represents stored GS-compatible insertion processor data.
 *
 * @group Synthesizer.GS Effects
 */
export interface GSInsertionProcessorSnapshot {
    /**
     * The EFX type of this processor, stored as `MSB << 8 | LSB`.
     * For example `0x30`, `0x10` is `0x3010`.
     *
     * > **Tip**
     * >
     * > Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf) (p.88, 237) for more information.
     */
    type: number;
    /**
     * 20 parameters for the effect. These depend on effect type.
     * After that 3 effect sends follow (index 20, 21, 22),
     * the length totaling to 23.
     *
     * Value `255` means "no change" for that parameter.
     *
     */
    params: Uint8Array;
}

/**
 * Constructor for a GS insertion processor.
 * @internal
 */
export type GSInsertionProcessorConstructor = new (
    sampleRate: number,
    maxBufferSize: number
) => GSInsertionProcessor;
