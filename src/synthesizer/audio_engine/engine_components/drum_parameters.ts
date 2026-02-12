/**
 * Represents a single drum instrument's XG/GS parameters.
 */
export class DrumParameters {
    /**
     * Pitch offset in cents.
     */
    public pitch = 0;
    /**
     * Gain multiplier.
     */
    public gain = 1;
    /**
     * Exclusive class override.
     */
    public exclusiveClass = 0;
    /**
     * Pan, 1-64-127, 0 is random. This adds to the channel pan!
     */
    public pan = 64;
    /**
     * Reverb multiplier.
     */
    public reverbGain = 0;
    /**
     * Chorus multiplier.
     */
    public chorusGain = 1;

    public copyInto(p: DrumParameters) {
        this.pitch = p.pitch;
        this.chorusGain = p.chorusGain;
        this.reverbGain = p.reverbGain;
        this.exclusiveClass = p.exclusiveClass;
        this.gain = p.gain;
        this.pan = p.pan;
        return this;
    }
}
