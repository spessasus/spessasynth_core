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

    /**
     * If note on should be received.
     */
    public rxNoteOn = true;

    /**
     * If note off should be received.
     * Note:
     * Due to the way sound banks implement drums (as 100s release time),
     * this means killing the voice on note off, not releasing it.
     */
    public rxNoteOff = false;

    public copyInto(p: DrumParameters) {
        this.pitch = p.pitch;
        this.chorusGain = p.chorusGain;
        this.reverbGain = p.reverbGain;
        this.exclusiveClass = p.exclusiveClass;
        this.gain = p.gain;
        this.pan = p.pan;
        this.rxNoteOff = p.rxNoteOff;
        this.rxNoteOn = p.rxNoteOn;
        return this;
    }
}
