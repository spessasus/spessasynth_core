/**
 * GS-compatible insertion effect (EFX) parameters.
 *
 * @group Synthesizer.GS Effects
 */
export interface GSInsertionParameter {
    /**
     * `0-127`
     *
     * This parameter sets the amount of insertion sound that will be sent to the reverb.
     * Higher values result in more sound being sent.
     */
    sendLevelToReverb: number;

    /**
     * `0-127`
     *
     * This parameter sets the amount of insertion sound that will be sent to the chorus.
     * Higher values result in more sound being sent.
     */
    sendLevelToChorus: number;

    /**
     * `0-127`
     *
     * This parameter sets the amount of insertion sound that will be sent to the delay.
     * Higher values result in more sound being sent.
     */
    sendLevelToDelay: number;
}

/**
 * A snapshot of a {@link GSInsertionBlock}.
 *
 * @group Synthesizer.GS Effects
 */
export interface GSInsertionBlockSnapshot extends GSInsertionParameter {
    /**
     * The EFX type of this block, stored as `MSB << 8 | LSB`.
     * For example `0x30`, `0x10` is `0x3010`.
     *
     * This is the requested type, even if the block does not support it.
     *
     * > **Tip**
     * >
     * > Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf) (p.88, 237) for more information.
     */
    type: number;

    /**
     * The 20 EFX parameters (0-19). Their meaning depends on the effect type.
     *
     * Value `255` means the parameter has not been changed since the type was set, so it uses the type default.
     */
    params: Uint8Array;
}

/**
 * The Insertion effect (EFX) processes the parts (channels) that have EFX assigned
 * (see {@link ChannelMIDIParameter.efxAssign}) and is routed straight to the output.
 * It can additionally send its output to the reverb, chorus and delay.
 *
 * This is a Roland GS-compatible insertion interface.
 *
 * It is used when {@link GlobalMIDIParameter.system} is `gm` `gm2` or `gs`,
 * but it is only enabled when an insertion parameter is set via a system exclusive message.
 *
 * {@link SpessaSynthProcessor} allows you to supply a custom insertion block.
 * A custom insertion block must implement this interface.
 *
 * ### Editing the parameters
 *
 * Editing the parameters can be done via GS system exclusive messages.
 *
 * > **Tip**
 * >
 * > Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf) (p.88, 237) for more information.
 *
 * @group Synthesizer.GS Effects
 */
export interface GSInsertionBlock extends GSInsertionParameter {
    /**
     * Sets the EFX type of the block.
     *
     * Type change resets the parameters and the send levels to their defaults.
     * Behavior for unsupported types is up to the implementation.
     *
     * @param type The 16-bit type value to use, `MSB << 8 | LSB`.
     */
    setType(type: number): void;

    /**
     * Gets the current 16-bit type of the block.
     * @returns The 16-bit (`MSB << 8 | LSB`) type requested by the last {@link setType} call.
     */
    getType(): number;

    /**
     * Resets this block to default values, including the EFX type and the send levels.
     */
    reset(): void;

    /**
     * Sets the given EFX parameter to the given value.
     * @param param The parameter number (0-based, 0-19).
     * @param value The 7-bit value.
     */
    setParameter(param: number, value: number): void;

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
     * @param sampleCount The amount of samples to mix. This will never be larger than {@link SynthProcessorOptions.maxBufferSize} of the parent {@link SpessaSynthProcessor} instance.
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

    /**
     * Gets a snapshot of this insertion block.
     */
    getSnapshot(): GSInsertionBlockSnapshot;

    /**
     * Restores this insertion block from a snapshot.
     * @param snapshot The snapshot to restore.
     */
    applySnapshot(snapshot: GSInsertionBlockSnapshot): void;
}
