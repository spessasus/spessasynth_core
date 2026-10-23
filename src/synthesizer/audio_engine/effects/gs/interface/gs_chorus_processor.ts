import type { GSSystemEffectParameter } from "./gs_system_effect_parameter";

/**
 * GS-compatible chorus parameters.
 *
 * Also see {@link GSChorusProcessor} to see how to implement a custom GS-compatible chorus processor.
 *
 * @group Synthesizer.GS Effects
 */
export interface GSChorusParameter extends GSSystemEffectParameter {
    /**
     * `0-127`
     *
     * This parameter sets the level at which the chorus sound is re-input (fed back) into the
     * chorus. By using feedback, a denser chorus sound can be created.
     * Higher values result in a greater feedback level.
     */
    feedback: number;
    /**
     * `0-127`
     *
     * This parameter sets the delay time of the chorus effect.
     */
    delay: number;
    /**
     * `0-127`
     *
     * This parameter sets the speed (frequency) at which the chorus sound is modulated.
     * Higher values result in faster modulation.
     */
    rate: number;
    /**
     * `0-127`
     *
     * This parameter sets the depth at which the chorus sound is modulated.
     * Higher values result in deeper modulation.
     */
    depth: number;

    /**
     * `0-127`
     *
     * This parameter sets the amount of chorus sound that will be sent to the reverb.
     * Higher values result in more sound being sent.
     */
    sendLevelToReverb: number;

    /**
     * `0-127`
     *
     * This parameter sets the amount of chorus sound that will be sent to the delay.
     * Higher values result in more sound being sent.
     */
    sendLevelToDelay: number;
}

/**
 * Chorus broadens the spatial image of the sound, adding depth and richness.
 *
 * This is a Roland GS-compatible chorus interface.
 *
 * It is used when {@link GlobalMIDIParameter.system} is `gm` `gm2` or `gs`.
 *
 * {@link SpessaSynthProcessor} allows you to supply a custom chorus processor.
 * A custom chorus processor must implement this interface.
 *
 * ### Editing the parameters
 *
 * Editing the parameters can be done via GS/GM2 system exclusive messages.
 *
 * > **Tip**
 * >
 * > Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf) (p.79, 235-236) for more information.
 *
 * @group Synthesizer.GS Effects
 */
export interface GSChorusProcessor extends GSChorusParameter {
    /**
     * Process the effect and **adds** it to the output.
     * @param input The input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param outputReverb The mono input for reverb. It always starts at index 0.
     * @param outputDelay The mono input for delay. It always starts at index 0.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix. This will never be larger than {@link SynthProcessorOptions.maxBufferSize} of the parent {@link SpessaSynthProcessor} instance.
     */
    process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        outputReverb: Float32Array,
        outputDelay: Float32Array,
        startIndex: number,
        sampleCount: number
    ): void;

    /**
     * Gets a snapshot of this effect processor instance.
     */
    getSnapshot(): GSChorusParameter;
}
