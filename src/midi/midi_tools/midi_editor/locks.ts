import type { DrumParameter, UserDrumSetParameter } from "../../types";
import type {
    ChannelModification,
    ChannelStatus,
    ModifyMIDIOptions
} from "./types";

/**
 * Checks if the options lock or clear a User Drum Set parameter of a note.
 * @param userDrumParams The User Drum Set options.
 * @param drumSet The User Drum Set number, 0 based.
 * @param midiNote The MIDI note number.
 * @param parameter The User Drum Set parameter.
 * @returns True if the file's message for it should be removed.
 */
export function isUserDrumLocked(
    userDrumParams: ModifyMIDIOptions["userDrumParams"],
    drumSet: number,
    midiNote: number,
    parameter: keyof UserDrumSetParameter
) {
    const params = userDrumParams?.get(drumSet);
    if (!params) return false;
    if (params === "clear") return true;
    const noteParams = params.get(midiNote);
    return noteParams === "clear" || noteParams?.[parameter] !== undefined;
}

/**
 * Checks if the options lock or clear a drum parameter of a note on this channel.
 * @param channelChanges The channel options, by channel.
 * @param channel The channel, with the port offset.
 * @param key The MIDI note number.
 * @param parameter The drum parameter.
 * @returns True if the file's message for it should be removed.
 */
export function shouldClearChannelDrum(
    channelChanges: Map<number, ChannelModification>,
    channel: number,
    key: number,
    parameter: keyof DrumParameter
) {
    const drumParams = channelChanges.get(channel)?.drumParams;
    if (drumParams === undefined) return false;
    // "clear" removes all drum edits for this channel
    if (drumParams === "clear") return true;
    const noteParams = drumParams.get(key);
    // Either "clear" or a set value removes the file's message
    return (
        noteParams !== undefined &&
        (noteParams === "clear" || noteParams[parameter] !== undefined)
    );
}

/**
 * This checks the sysEx version of drum setup, which specifies a map rather than a channel.
 * @param channelChanges The channel options, by channel.
 * @param channelStatuses The tracked state of every channel, for the drum map each one uses.
 * @param drumMap The drum map the message edits.
 * @param key The MIDI note number.
 * @param parameter The drum parameter.
 * @returns True if the file's message for it should be removed.
 */
export function shouldClearMapDrum(
    channelChanges: Map<number, ChannelModification>,
    channelStatuses: ChannelStatus[],
    drumMap: number,
    key: number,
    parameter: keyof DrumParameter
) {
    // The synth applies map edits to the channels of every port
    for (let channel = 0; channel < channelStatuses.length; channel++) {
        if (channelStatuses[channel].drumMap !== drumMap) continue;
        if (shouldClearChannelDrum(channelChanges, channel, key, parameter)) {
            return true;
        }
    }
    return false;
}
