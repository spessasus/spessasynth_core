/**
 * The raw DSP processor for Yamaha XG effects.
 * Reverb, Chorus, Variation and Insertion all use it.
 *
 * Used only in the default implementation.
 */
export interface DefaultXGEffectProcessor {
    /**
     * The type of the effect.
     * 16-bit ID, `(MSB << 8) | LSB` (e.g. 0x4100)
     */
    readonly type: number;
    /**
     * Resets all parameters to default.
     */
    reset(): void;

    /**
     * Sets the given effect parameter to the given value.
     * @param param The parameter number (0-based).
     * @param value The value: 14-bit for two-byte params, 7-bit for single-byte params.
     */
    setParameter(param: number, value: number): void;
    /**
     * Process the effect and **OVERWRITES** it to the output.
     * @param inputLeft The input buffer to process. It always starts at index 0.
     * @param inputRight The input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param sampleCount The amount of samples to mix. This will never be larger than {@link SynthProcessorOptions.maxBufferSize} of the parent {@link SpessaSynthProcessor} instance.
     * @param isInsertion Indicates if the effect is in the insertion mode. If false, only wet output is sent. If true, if the effect has the "Dry/Wet" parameter, it honors it.
     */
    process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number,
        isInsertion: boolean
    ): void;

    /**
     * Gets a snapshot of this effect processor.
     * @returns A copy of the 16 parameter values (14-bit wide params, 7-bit single-byte params).
     */
    getSnapshot(): Int16Array;
}
export type DefaultXGEffectProcessorConstructor = new (
    sampleRate: number,
    maxBufferSize: number
) => DefaultXGEffectProcessor;
