import type { GSSystemEffectParameter } from "./gs_system_effect_parameter";

/**
 * GS-compatible delay parameters.
 *
 * Also see {@link GSDelayProcessor} to see how to implement a custom GS-compatible delay processor.
 *
 * @group Synthesizer.GS Effects
 */
export interface GSDelayParameter extends GSSystemEffectParameter {
    /**
     * 0-115
     * 0.1ms-340ms-1000ms
     * The delay effect has three delay times; center, left and
     * right (when listening in stereo). Delay Time Center sets the delay time of the delay
     * located at the center.
     * Refer to SC-8850 Owner's Manual p. 236 for the exact mapping of the values.
     */
    timeCenter: number;

    /**
     * 0-120
     * 4% - 500%
     * This parameter sets the delay time of the delay located at the left as a percentage of
     * the Delay Time Center (up to a max. of 1.0 s).
     * The resolution is 100/24(%).
     */
    timeRatioLeft: number;

    /**
     * 1-120
     * 4%-500%
     * This parameter sets the delay time of the delay located at the right as a percentage of
     * the Delay Time Center (up to a max. of 1.0 s).
     * The resolution is 100/24(%).
     */
    timeRatioRight: number;

    /**
     * 0-127
     * This parameter sets the volume of the central delay. Higher values result in a louder
     * center delay.
     */
    levelCenter: number;

    /**
     * 0-127
     * This parameter sets the volume of the left delay. Higher values result in a louder left
     * delay.
     */
    levelLeft: number;

    /**
     * 0-127
     * This parameter sets the volume of the right delay. Higher values result in a louder
     * right delay.
     */
    levelRight: number;

    /**
     * 0-127
     * (-64)-63
     * This parameter affects the number of times the delay will repeat. With a value of 0,
     * the delay will not repeat. With higher values there will be more repeats.
     * With negative (-) values, the center delay will be fed back with inverted phase.
     * Negative values are effective with short delay times.
     */
    feedback: number;

    /**
     * 0-127
     * This parameter sets the amount of delay sound that is sent to the reverb.
     * Higher values result in more sound being sent.
     */
    sendLevelToReverb: number;
}

/**
 * Delay creates echoes. It is also possible to give depth and width to a sound by adding
 * a short delay to the original sound.
 *
 * This is a Roland GS-compatible delay interface.
 *
 * It is used when {@link GlobalMIDIParameter.system} is `gm` `gm2` or `gs`.
 *
 * > **Note**
 * >
 * > Delay is disabled in XG mode.
 *
 * {@link SpessaSynthProcessor} allows you to supply a custom delay processor.
 * A custom delay processor must implement this interface.
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
export interface GSDelayProcessor extends GSDelayParameter {
    /**
     * Process the effect and **adds** it to the output.
     * @param input The input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param outputReverb The mono input for reverb. It always starts at index 0.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix. This will never be larger than {@link SynthProcessorOptions.maxBufferSize} of the parent {@link SpessaSynthProcessor} instance.
     */
    process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        outputReverb: Float32Array,
        startIndex: number,
        sampleCount: number
    ): void;

    /**
     * Gets a snapshot of this effect processor instance.
     */
    getSnapshot(): GSDelayParameter;
}
