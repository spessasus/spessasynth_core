/**
 * GS-compatible equalizer parameters.
 *
 * Also see {@link GSEqualizerProcessor} to see how to implement a custom GS-compatible equalizer processor.
 *
 * @group Synthesizer.GS Effects
 */
export interface GSEqualizerParameter {
    /**
     * 0-1
     * 200 Hz, 400 Hz
     * This parameter sets the frequency of the low range shelf.
     */
    lowFrequency: number;

    /**
     * 52-76 (`0x34`-`0x4C`)
     * -12 dB - 0 dB - +12 dB
     * This parameter sets the amount of boost or cut for the low frequency range.
     * 64 is 0 dB, each step is 1 dB.
     */
    lowGain: number;

    /**
     * 0-1
     * 3 kHz, 6 kHz
     * This parameter sets the frequency of the high range shelf.
     */
    highFrequency: number;

    /**
     * 52-76 (`0x34`-`0x4C`)
     * -12 dB - 0 dB - +12 dB
     * This parameter sets the amount of boost or cut for the high frequency range.
     * 64 is 0 dB, each step is 1 dB.
     */
    highGain: number;
}

/**
 * The equalizer is a two-band (low and high) shelving equalizer which boosts or cuts specified frequency
 * ranges of the sound. An equalizer lets you
 * boost or cut specified frequency ranges of a sound to adjust the tone. For each range,
 * high and low, you can specify the frequency and the amount of boost or cut (gain).
 *
 * Only the parts with EQ enabled (see {@link ChannelMIDIParameter.eqEnabled}) pass through it,
 * and the insertion effect passes through it when {@link GSInsertionParameter.sendEQSwitch} is on.
 * The reverb, chorus and delay outputs do not.
 *
 * This is a Roland GS-compatible equalizer interface.
 *
 * It is used when {@link GlobalMIDIParameter.system} is `gm` `gm2` or `gs`.
 *
 * > **Note**
 * >
 * > The equalizer is disabled in XG mode.
 *
 * {@link SpessaSynthProcessor} allows you to supply a custom equalizer processor.
 * A custom equalizer processor must implement this interface.
 *
 * ### Editing the parameters
 *
 * Editing the parameters can be done via GS system exclusive messages.
 *
 * > **Tip**
 * >
 * > Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf) (p.78, 86, 236) for more information.
 *
 * @group Synthesizer.GS Effects
 */
export interface GSEqualizerProcessor extends GSEqualizerParameter {
    /**
     * Process the effect and **adds** it to the output.
     * @param inputLeft The left input buffer to process. It always starts at index 0.
     * @param inputRight The right input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix. This will never be larger than {@link SynthProcessorOptions.maxBufferSize} of the parent {@link SpessaSynthProcessor} instance.
     */
    process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ): void;

    /**
     * Gets a snapshot of this effect processor instance.
     */
    getSnapshot(): GSEqualizerParameter;

    /**
     * Restores this effect processor instance from a snapshot.
     * @param snapshot The snapshot to restore.
     */
    applySnapshot(snapshot: GSEqualizerParameter): void;
}
