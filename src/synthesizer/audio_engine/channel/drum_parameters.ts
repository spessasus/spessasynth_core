export interface DrumParameterData {
    /**
     * Pitch offset in semitones. Relative value.
     * May be floating point! (GS half-semitone coarse tune resolution)
     */
    pitchCoarse: number;

    /**
     * Pitch offset in cents. Relative value.
     */
    pitchFine: number;

    /**
     * Level in 0 - 127 range.
     */
    level: number;

    /**
     * Exclusive class override.
     */
    assignGroup: number;

    /**
     * Pan, 1-64-127, 0 is random. This adds to the channel pan!
     */
    pan: number;

    /**
     * Reverb send level 0-127
     */
    reverbSend: number;

    /**
     * Chorus send level 0-127
     */
    chorusSend: number;

    /**
     * Variation/delay send level 0-127
     */
    variationSend: number;

    /**
     * If note on should be received.
     */
    rxNoteOn: boolean;

    /**
     * If note off should be received.
     * Note:
     * Due to the way sound banks implement drums (as 100s release time),
     * this means killing the voice on note off, not releasing it.
     */
    rxNoteOff: boolean;
}

/**
 * Represents a single drum instrument's XG/GS parameters.
 */
export class DrumParameter implements DrumParameterData {
    public pitchCoarse = 0;
    public pitchFine = 0;
    public level = 127;
    public assignGroup = 0;
    public pan = 64;
    public reverbSend = 127;
    public chorusSend = 127;
    public variationSend = 127;
    public rxNoteOn = true;
    public rxNoteOff = false;

    public static copyFrom(p: DrumParameter) {
        const d = new DrumParameter();
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
    public static copyInto(source: DrumParameter, dest: DrumParameter) {
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
