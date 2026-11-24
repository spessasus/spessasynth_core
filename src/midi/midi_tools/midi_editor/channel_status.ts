import { MIDI_DRUM_CHANNEL } from "../../../synthesizer/audio_engine/synth_constants";
import { MIDIControllers } from "../../enums";
import { ParameterTracker } from "../parameter_tracker";
import { DEFAULT_GS_DRUM_MAP, MELODIC_MAP } from "../sysex_data";
import type { ChannelModification } from "./types";

/**
 * Creates the tracked state of a channel at the start of the file.
 * @param channel The channel, with the port offset.
 * @param change The channel's options, if it is modified.
 * @returns The new channel state.
 */
export function createChannelStatus(
    channel: number,
    change: ChannelModification | undefined
) {
    return {
        channel,
        isFirstNoteOn: true,
        // The default drum map before the first reset (GS, like the synth)
        drumMap:
            channel % 16 === MIDI_DRUM_CHANNEL
                ? DEFAULT_GS_DRUM_MAP
                : MELODIC_MAP,
        param: new ParameterTracker(channel),
        clearedParams: {
            selection: clearedSelection(),
            data: true
        },
        selectionModified: unmodifiedSelection(),
        outputRegistered: true,
        relativeKeyShift: change?.keyShift ?? 0,
        relativeFineTune: change?.fineTune ?? 0,
        currentFineTune: 0,
        currentKeyShift: 0,
        noteShifts: new Int16Array(128),
        pendingParam: undefined,
        bankMSB: 0
    };
}

/**
 * The N/RPN selection after a reset or Reset All Controllers: null, so there is nothing to delete.
 * @returns Every selection controller flagged as cleared.
 */
export function clearedSelection() {
    return {
        [MIDIControllers.registeredParameterMSB]: true,
        [MIDIControllers.registeredParameterLSB]: true,
        [MIDIControllers.nonRegisteredParameterMSB]: true,
        [MIDIControllers.nonRegisteredParameterLSB]: true
    };
}

/**
 * The output's N/RPN selection matches the file's, like after a reset (both are null).
 * @returns Every selection controller flagged as not modified.
 */
export function unmodifiedSelection() {
    return {
        [MIDIControllers.registeredParameterMSB]: false,
        [MIDIControllers.registeredParameterLSB]: false,
        [MIDIControllers.nonRegisteredParameterMSB]: false,
        [MIDIControllers.nonRegisteredParameterLSB]: false
    };
}
