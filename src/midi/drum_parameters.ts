import type { DrumParameter, UserDrumSetParameter } from "./types";

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

    private static readonly DEFAULT_USER_DATA: UserDrumSetParameter = {
        ...this.DEFAULT_DATA,
        // Defaults to GS
        sourceDrumSet: 2,
        sourceNoteNumber: 0,
        program: 0
    };

    public static getDefaultUserData(midiNote: number): UserDrumSetParameter {
        return {
            ...this.DEFAULT_USER_DATA,
            sourceNoteNumber: midiNote
        };
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
