import type { DrumParameter, UserDrumSetParameter } from "./types";
import { DEFAULT_DRUM_REVERB } from "../synthesizer/exports";

export class DrumParameterUtils {
    public static readonly DEFAULT_DATA: readonly DrumParameter[] = Array.from(
        { length: 128 },
        // eslint-disable-next-line unicorn/consistent-function-scoping
        (_, i) => ({
            pitchCoarse: 0,
            pitchFine: 0,
            level: 120,
            assignGroup: 0,
            pan: 64,
            reverbSend: DEFAULT_DRUM_REVERB[i],
            chorusSend: 0,
            variationSend: 0,
            rxNoteOn: true,
            rxNoteOff: false
        })
    );
    public static readonly DEFAULT_USER_DATA: readonly UserDrumSetParameter[] =
        Array.from({ length: 128 }, (_, i) => ({
            ...this.DEFAULT_DATA[i],
            sourceNoteNumber: i,
            // Default to 2 which is SC-88 drum set (confirmed with SCVA)
            sourceDrumSet: 2,
            program: 0
        }));

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
     * @param midiNote the MIDI note of this parameter.
     */
    public static isDefault(param: DrumParameter, midiNote: number) {
        const d = this.DEFAULT_DATA[midiNote];
        return (
            param.pitchCoarse === d.pitchCoarse &&
            param.pitchFine === d.pitchFine &&
            param.level === d.level &&
            param.assignGroup === d.assignGroup &&
            param.pan === d.pan &&
            param.reverbSend === d.reverbSend &&
            param.chorusSend === d.chorusSend &&
            param.variationSend === d.variationSend &&
            param.rxNoteOn === d.rxNoteOn &&
            param.rxNoteOff === d.rxNoteOff
        );
    }

    /**
     * Checks if this user Drum Set Parameter is the default.
     * @param param the param to check.
     * @param midiNote the MIDI note of this parameter.
     */
    public static isUserDefault(param: UserDrumSetParameter, midiNote: number) {
        const d = this.DEFAULT_USER_DATA[midiNote];
        return (
            this.isDefault(param, midiNote) &&
            param.sourceNoteNumber === midiNote &&
            param.sourceDrumSet === d.sourceDrumSet &&
            param.program === d.program
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
