import type { GSSystemEffectParameter } from "./gs_system_effect_parameter";

/**
 * GS-compatible reverb parameters.
 *
 * Also see {@link GSReverbProcessor} to see how to implement a custom GS-compatible reverb processor.
 *
 * @group Synthesizer.GS Effects
 */
export interface GSReverbParameter extends GSSystemEffectParameter {
    /**
     * `0-7`
     *
     * This parameter selects the type of reverb. 0–5 are reverb effects, and 6 and 7 are delay
     * effects.
     *
     * > **NOTE**
     * >
     * > If character is not available, it should default to the first one.
     */
    character: number;
    /**
     * `0-127`
     *
     * This parameter sets the time over which the reverberation will continue.
     * Higher values result in longer reverberation.
     */
    time: number;
    /**
     * `0-127`
     *
     * This parameter is used when the Reverb Character is set to 6 or 7, or the Reverb Type
     * is set to Delay or Panning Delay (Rev Character 6, 7). It sets the way in which delays
     * repeat. Higher values result in more delay repeats.
     */
    delayFeedback: number;
    /**
     * `0 - 127 (ms)`
     *
     * This parameter sets the delay time until the reverberant sound is heard.
     * Higher values result in a longer pre-delay time, simulating a larger reverberant space.
     */
    preDelayTime: number;
}

/**
 * Reverb is an effect that adds reverberation to a sound, as you would hear in a concert
 * hall.
 *
 * This is a Roland GS-compatible reverb interface.
 *
 * It is used when {@link GlobalMIDIParameter.system} is `gm` `gm2` or `gs`.
 *
 * {@link SpessaSynthProcessor} allows you to supply a custom reverb processor.
 * A custom reverb processor must implement this interface.
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
export interface GSReverbProcessor extends GSReverbParameter {
    /**
     * Process the effect and **adds** it to the output.
     * @param input The input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix. This will never be larger than {@link SynthProcessorOptions.maxBufferSize} of the parent {@link SpessaSynthProcessor} instance.
     */
    process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ): void;

    /**
     * Gets a snapshot of this effect processor instance.
     */
    getSnapshot(): GSReverbParameter;
}
