interface EffectProcessor {
    /**
     * 0-127
     * This parameter sets the amount of the effect sent to the effect output.
     */
    level: number;

    /**
     * 0-7
     * A low-pass filter can be applied to the sound coming into the effect to cut the high
     * frequency range. Higher values will cut more of the high frequencies, resulting in a
     * more mellow effect sound.
     */
    preLowpass: number;
}
export interface ReverbProcessor extends EffectProcessor {
    /**
     * 0-7.
     * If character is not available, it should default to the first one.
     *
     * This parameter selects the type of reverb. 0–5 are reverb effects, and 6 and 7 are delay
     * effects.
     */
    character: number;
    /**
     * 0-127
     * This parameter sets the time over which the reverberation will continue.
     * Higher values result in longer reverberation.
     */
    time: number;
    /**
     * 0-127
     * This parameter is used when the Reverb Character is set to 6 or 7, or the Reverb Type
     * is set to Delay or Panning Delay (Rev Character 6, 7). It sets the way in which delays
     * repeat. Higher values result in more delay repeats.
     */
    delayFeedback: number;
    /**
     * 0 - 127 (ms)
     * This parameter sets the delay time until the reverberant sound is heard.
     * Higher values result in a longer pre-delay time, simulating a larger reverberant space.
     */
    preDelayTime: number;

    /**
     * Process the effect and ADDS it to the output.
     * @param input The input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix.
     */
    process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ): void;
}

export interface ChorusProcessor extends EffectProcessor {
    /**
     * 0-127
     * This parameter sets the level at which the chorus sound is re-input (fed back) into the
     * chorus. By using feedback, a denser chorus sound can be created.
     * Higher values result in a greater feedback level.
     */
    feedback: number;
    /**
     * 0-127
     * This parameter sets the delay time of the chorus effect.
     */
    delay: number;
    /**
     * 0-127
     * This parameter sets the speed (frequency) at which the chorus sound is modulated.
     * Higher values result in faster modulation.
     */
    rate: number;
    /**
     * 0-127
     * This parameter sets the depth at which the chorus sound is modulated.
     * Higher values result in deeper modulation.
     */
    depth: number;

    /**
     * 0-127
     * This parameter sets the amount of chorus sound that will be sent to the reverb.
     * Higher values result in more sound being sent.
     */
    sendLevelToReverb: number;

    /**
     * 0-127
     * This parameter sets the amount of chorus sound that will be sent to the delay.
     * Higher values result in more sound being sent.
     */
    sendLevelToDelay: number;

    /**
     * Process the effect and ADDS it to the output.
     * @param input The input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param outputReverb The mono input for reverb. It always starts at index 0.
     * @param outputDelay The mono input for delay. It always starts at index 0.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix.
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
}

export interface DelayProcessor extends EffectProcessor {
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

    /**
     * Process the effect and ADDS it to the output.
     * @param input The input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param outputReverb The mono input for reverb. It always starts at index 0.
     * @param startIndex The index to start mixing at into the output buffers.
     * @param sampleCount The amount of samples to mix.
     */
    process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        outputReverb: Float32Array,
        startIndex: number,
        sampleCount: number
    ): void;
}

export interface InsertionProcessor {
    /**
     * The EFX type of this processor, stored as MSB << | LSB.
     * For example 0x30, 0x10 is 0x3010
     */
    readonly type: number;

    /**
     * 0-1 (floating point)
     * This parameter sets the amount of insertion sound that will be sent to the reverb.
     * Higher values result in more sound being sent.
     */
    sendLevelToReverb: number;

    /**
     * 0-1 (floating point)
     * This parameter sets the amount of insertion sound that will be sent to the chorus.
     * Higher values result in more sound being sent.
     */
    sendLevelToChorus: number;

    /**
     * 0-1 (floating point)
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
     * @param parameter The parameter number (0-19).
     * @param value The new value (0-127).
     */
    setParameter(parameter: number, value: number): void;

    /**
     * Process the effect and ADDS it to the output.
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

export type InsertionProcessorConstructor = new (
    sampleRate: number
) => InsertionProcessor;
