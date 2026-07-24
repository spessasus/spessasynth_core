/**
 * Represents a single drum instrument's XG/GS parameters.
 */
export class DrumParameters {
    /**
     * Pitch offset in semitones.
     * May be floating point! (GS half-semitone coarse tune resolution)
     */
    public pitchCoarse = 0;

    /**
     * Pitch offset in cents.
     */
    public pitchFine = 0;

    /**
     * Level in 0 - 127 range.
     */
    public level = 1;

    /**
     * Exclusive class override.
     */
    public assignGroup = 0;
    /**
     * Pan, 1-64-127, 0 is random. This adds to the channel pan!
     */
    public pan = 64;
    /**
     * Reverb send level 0-127
     */
    public reverbSend = 127;
    /**
     * Chorus send level 0-127
     */
    public chorusSend = 127;

    /**
     * Variation/delay send level 0-127
     */
    public variationSend = 127;

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

    public static copyFrom(p: DrumParameters) {
        const d = new DrumParameters();
        d.pitchCoarse = p.pitchCoarse;
        d.pitchFine = p.pitchFine;
        d.level = p.level;
        d.assignGroup = p.assignGroup;
        d.pan = p.pan;
        d.reverbSend = p.reverbSend;
        d.chorusSend = p.chorusSend;
        d.variationSend = p.variationSend;
        d.rxNoteOff = p.rxNoteOff;
        d.rxNoteOn = p.rxNoteOn;
        return d;
    }

    /**
     * Copies the drum data into a specified drum parameter instance.
     * @param source the drum parameter instance to copy from.
     * @param dest the drum parameter instance to copy into.
     */
    public static copyInto(source: DrumParameters, dest: DrumParameters) {
        dest.pitchCoarse = source.pitchCoarse;
        dest.pitchFine = source.pitchFine;
        dest.level = source.level;
        dest.assignGroup = source.assignGroup;
        dest.pan = source.pan;
        dest.reverbSend = source.reverbSend;
        dest.chorusSend = source.chorusSend;
        dest.variationSend = source.variationSend;
        dest.rxNoteOff = source.rxNoteOff;
        dest.rxNoteOn = source.rxNoteOn;
    }
}
