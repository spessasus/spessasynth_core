/**
 * Represents a single drum instrument's XG/GS parameters.
 */
export interface DrumParameter {
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

export interface UserDrumSetParameter extends DrumParameter {
    /**
     * The source drum set bank LSB number.
     */
    sourceDrumSet: number;
    /**
     * The MIDI program number of the source drum set.
     */
    program: number;
    /**
     * The MIDI key number from the source drum set to bind.
     */
    sourceNoteNumber: number;
}

export class DrumParameterUtils {
    public static readonly DEFAULT_DATA: DrumParameter = {
        pitchCoarse: 0,
        pitchFine: 0,
        level: 120,
        assignGroup: 0,
        pan: 64,
        reverbSend: 127,
        chorusSend: 127,
        variationSend: 127,
        rxNoteOn: true,
        rxNoteOff: false
    };

    public static readonly DEFAULT_USER_DATA: UserDrumSetParameter = {
        ...this.DEFAULT_DATA,
        sourceDrumSet: 0,
        sourceNoteNumber: 0,
        program: 0
    };

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
    /**
     * Checks if this user drum parameter is the default.
     * @param param the param to check.
     */
    public static isDefault(param: DrumParameter) {
        return (
            param.pitchCoarse === this.DEFAULT_DATA.pitchCoarse &&
            param.pitchFine === this.DEFAULT_DATA.pitchFine &&
            param.level === this.DEFAULT_DATA.level &&
            param.assignGroup === this.DEFAULT_DATA.assignGroup &&
            param.pan === this.DEFAULT_DATA.pan &&
            param.reverbSend === this.DEFAULT_DATA.reverbSend &&
            param.chorusSend === this.DEFAULT_DATA.chorusSend &&
            param.variationSend === this.DEFAULT_DATA.variationSend &&
            param.rxNoteOn === this.DEFAULT_DATA.rxNoteOn &&
            param.rxNoteOff === this.DEFAULT_DATA.rxNoteOff
        );
    }

    /**
     * Checks if this user Drum Set Parameter is the default.
     * @param param the param to check.
     * @param midiNote the MIDI note of this parameter.
     */
    public static isUserDefault(param: UserDrumSetParameter, midiNote: number) {
        return (
            this.isDefault(param) &&
            param.sourceNoteNumber === midiNote &&
            param.sourceDrumSet === this.DEFAULT_USER_DATA.sourceDrumSet &&
            param.program === this.DEFAULT_USER_DATA.program
        );
    }

    /**
     * Copies the user drum data into a specified drum parameter instance.
     * @param source the user drum parameter instance to copy from.
     * @param dest the user drum parameter instance to copy into.
     */
    public static copyIntoUser(
        source: UserDrumSetParameter,
        dest: UserDrumSetParameter
    ) {
        this.copyInto(source, dest);
        dest.sourceDrumSet = source.sourceDrumSet;
        dest.sourceNoteNumber = source.sourceNoteNumber;
        dest.program = source.program;
    }
}
