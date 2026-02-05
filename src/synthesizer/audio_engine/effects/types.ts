interface EffectProcessor {
    /**
     * 0-64-127
     * This parameter sets the amount of the effect.
     */
    level: number;

    /**
     * Process the effect and ADDS it to the output.
     * @param input The input buffer to process. It always starts at index 0.
     * @param outputLeft The left output buffer.
     * @param outputRight The right output buffer.
     * @param startIndex The index to start mixing at, inclusive.
     * @param endIndex The index to stop mixing at, exclusive.
     */
    process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        endIndex: number
    ): void;
}
export interface ReverbProcessor extends EffectProcessor {
    /**
     * 0 - 7.
     * If character is not available, it should default to the first one.
     *
     * This parameter selects the type of reverb. 0–5 are reverb effects, and 6 and 7 are delay
     * effects.
     */
    character: number;
    /**
     * 0-7
     * A low pass filter can be applied to the sound coming into the reverb to cut the high
     * frequency range. Higher values will cut more of the high frequencies, resulting in a
     * more mellow reverberation.
     */
    preLowpass: number;
    /**
     * 0-64-127
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
     * 0 - 127 ms
     * This parameter sets the delay time until the reverberant sound is heard.
     * Higher values result in a longer pre-delay time, simulating a larger reverberant space.
     */
    preDelayTime: number;
}

export interface ChorusProcessor extends EffectProcessor {
    /**
     * 0-7
     * A low-pass filter can be applied to the sound coming into the chorus to cut the high
     * frequency range. Higher values will cut more of the high frequencies, resulting in a
     * more mellow chorus sound.
     */
    preLowpass: number;
    /**
     * 0-8-127
     * This parameter sets the level at which the chorus sound is re-input (fed back) into the
     * chorus. By using feedback, a denser chorus sound can be created.
     * Higher values result in a greater feedback level.
     */
    feedback: number;
    /**
     * 0-80-127
     * This parameter sets the delay time of the chorus effect.
     */
    delay: number;
    /**
     * 0-3-127
     * This parameter sets the speed (frequency) at which the chorus sound is modulated.
     * Higher values result in faster modulation.
     */
    rate: number;
    /**
     * 0-19-127
     * This parameter sets the depth at which the chorus sound is modulated.
     * Higher values result in deeper modulation.
     */
    depth: number;
}
