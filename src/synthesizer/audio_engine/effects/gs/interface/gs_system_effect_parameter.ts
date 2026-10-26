/**
 * Parameters shared between all GS system effects.
 *
 * @group Synthesizer.GS Effects
 */
export interface GSSystemEffectParameter {
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
