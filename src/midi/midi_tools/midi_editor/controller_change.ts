import { SpessaLog } from "../../../utils/loggin";
import { ConsoleColors } from "../../../utils/other";
import { MIDIMessage } from "../../midi_message";
import { MIDI_DRUM_CHANNEL } from "../../../synthesizer/audio_engine/synth_constants";
import * as BankSelectHacks from "../../../utils/bank_select_hacks";
import { type MIDIController, MIDIControllers } from "../../enums";
import * as MIDIUtils from "../midi_utils";
import type { DrumParameter, UserDrumSetParameter } from "../../types";
import { RP_15_RESET_CC_NUMS } from "../../../synthesizer/audio_engine/channel/reset";
import type { AnalyzedMIDIMessage } from "../analyzed_message";
import { MELODIC_MAP } from "../sysex_data";
import type { MIDIEditor } from "./midi_editor";

/**
 * Handles a channel MIDI parameter change, from an RPN or a SysEx.
 * Deletes it if the parameter (or the drum mode, through a locked patch) is locked,
 * adds the relative fine tune to the file's fine tune, and tracks the drum map.
 * @param channel The channel, with the port offset.
 * @param data The analyzed parameter change.
 * @param isRPN If the change comes from an RPN (data entry), not a SysEx.
 */
export function handleChannelMIDIParam(
    this: MIDIEditor,
    channel: number,
    data: Extract<AnalyzedMIDIMessage, { type: "Channel MIDI Param" }>,
    isRPN = false
) {
    const channelStatus = this.channelStatuses[channel];
    if (!channelStatus) return;
    const channelChange = this.channelChanges.get(channel);

    // Locked, remove
    // The first note on inserts the locked value with the relative tune added, so we delete it here
    if (channelChange?.midiParams?.[data.parameter] !== undefined) {
        this.deleteCurrentEvent();
        return;
    }
    // A locked patch owns the drum mode too, like bank select.
    // A cleared patch only removes program changes and bank selects, the drum mode stays
    if (
        data.parameter === "drumMap" &&
        channelChange?.patch &&
        channelChange.patch !== "clear"
    ) {
        this.deleteCurrentEvent();
        return;
    }
    // Track the drum map, only if the message stays
    if (data.parameter === "drumMap") {
        // Like the synth's part mode on XG (and GM2): the bank follows the mode
        // Before the next program change, and the XG drum part refuses to turn melodic
        if (BankSelectHacks.isSystemXG(this.system)) {
            const isDrum = data.value !== MELODIC_MAP;
            if (
                !isDrum &&
                this.system === "xg" &&
                channel % 16 === MIDI_DRUM_CHANNEL
            )
                return;
            if (!isDrum)
                channelStatus.bankMSB = BankSelectHacks.getDefaultBank(
                    this.system
                );
            else if (!BankSelectHacks.isXGDrum(channelStatus.bankMSB))
                channelStatus.bankMSB = BankSelectHacks.getDrumBank(
                    this.system
                );
        }
        channelStatus.drumMap = data.value;
    }
    // Adjust relative tune
    if (
        !channelChange ||
        data.parameter !== "fineTune" ||
        !channelStatus.relativeFineTune
    )
        return;
    channelStatus.currentFineTune = data.value;
    // Add the relative fine tune to the existing one
    const newTune = channelStatus.relativeFineTune + data.value;

    channelStatus.currentKeyShift = Math.trunc(newTune / 100);
    const targetTune = newTune % 100;

    SpessaLog.info(
        `%cFine tuning already present on ${channel}%c (${data.value})%c, ` +
            `new relative tune: %c${newTune}%c cents. Key shift: %c${channelStatus.currentKeyShift}%c semitones. ` +
            `Actual RPN value to set: %c${targetTune} cents.`,
        ConsoleColors.info,
        ConsoleColors.recognized,
        ConsoleColors.info,
        ConsoleColors.value,
        ConsoleColors.info,
        ConsoleColors.value,
        ConsoleColors.info,
        ConsoleColors.value
    );

    // And update this tuning
    const index = this.eventIndexes[this.trackNum];
    const e = this.midi.tracks[this.trackNum].events[index];

    this.deleteCurrentEvent();

    // Don't update tuning if no notes have played.
    if (channelStatus.isFirstNoteOn) {
        return;
    }

    // Build the replacement rpn
    const newRPN = MIDIUtils.setChannelMIDIParameter(
        e.ticks,
        channel % 16,
        this.system,
        "fineTune",
        targetTune
    );
    const pending = channelStatus.pendingParam;

    // If we have a pending N/RPN, then this is its extra byte
    if (pending !== undefined && isRPN) {
        // This is the extra byte of the RPN message, update the original with the corrected value
        SpessaLog.info(
            `%cSecond RPN data byte on ${channel}%c, updating inserted parameter in place.`,
            ConsoleColors.info,
            ConsoleColors.recognized
        );
        pending.events[2].data[1] = newRPN[2].data[1];
        pending.events[3].data[1] = newRPN[3].data[1];
        channelStatus.pendingParam = undefined;
        return;
    }

    // And update this tuning
    this.addEventsBefore(...newRPN);
    // Track after adding, only for RPN change.
    // A not-RPN message voids any pending pair instead:
    // A later half belongs to a new message, not the old one.
    channelStatus.pendingParam = isRPN ? { events: newRPN } : undefined;
}

/**
 * Checks if the options lock or clear a User Drum Set parameter of a note.
 * @param drumSet The User Drum Set number, 0 based.
 * @param midiNote The MIDI note number.
 * @param parameter The User Drum Set parameter.
 * @returns True if the file's message for it should be removed.
 */
export function isUserDrumLocked(
    this: MIDIEditor,
    drumSet: number,
    midiNote: number,
    parameter: keyof UserDrumSetParameter
) {
    const params = this.userDrumSetParams?.get(drumSet);
    if (!params) return false;
    if (params === "clear") return true;
    const noteParams = params.get(midiNote);
    return noteParams === "clear" || noteParams?.[parameter] !== undefined;
}

/**
 * Checks if the options lock or clear a drum parameter of a note on this channel.
 * @param channel The channel, with the port offset.
 * @param key The MIDI note number.
 * @param parameter The drum parameter.
 * @returns True if the file's message for it should be removed.
 */
export function shouldClearChannelDrum(
    this: MIDIEditor,
    channel: number,
    key: number,
    parameter: keyof DrumParameter
) {
    const drumParams = this.channelChanges.get(channel)?.drumParams;
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
 */
export function shouldClearMapDrum(
    this: MIDIEditor,
    drumMap: number,
    key: number,
    parameter: keyof DrumParameter
) {
    // The synth applies map edits to the channels of every port
    for (let channel = 0; channel < this.channelStatuses.length; channel++) {
        if (this.channelStatuses[channel].drumMap !== drumMap) continue;
        if (this.shouldClearChannelDrum(channel, key, parameter)) {
            return true;
        }
    }
    return false;
}

/**
 * Handles a controller change, from a CC message or a SysEx.
 * Deletes locked controllers, tracks the RPN/NRPN selection and data entry
 * (a locked parameter deletes the whole RPN/NRPN message) and handles Reset All Controllers.
 * @param ccNum The controller number.
 * @param value The controller value.
 * @param channel The channel, with the port offset.
 */
export function handleControllerChange(
    this: MIDIEditor,
    ccNum: MIDIController,
    value: number,
    channel: number
) {
    // Change may be undefined but don't check, because we may encounter a "clear Drum param" request while the channel is not changed
    // This still involves removing the drum NRPN
    // Also param tracking
    const channelChange = this.channelChanges.get(channel);
    const channelStatus = this.channelStatuses[channel];

    const index = this.eventIndexes[this.trackNum];
    const change = channelChange?.controllers?.get(ccNum);
    if (change !== undefined) {
        // This controller is locked, BEGONE CHANGE!
        this.deleteCurrentEvent();
        return;
    }
    switch (ccNum) {
        case MIDIControllers.bankSelect:
        case MIDIControllers.bankSelectLSB: {
            if (channelChange?.patch) {
                // BEGONE!
                this.deleteCurrentEvent();
                return;
            }
            if (ccNum === MIDIControllers.bankSelect)
                channelStatus.bankMSB = value;
            return;
        }

        case MIDIControllers.pan: {
            if (channelChange?.midiParams?.randomPan === true) {
                // Random pan gets disabled by regular pan, prevent that here
                this.deleteCurrentEvent();
            }
            return;
        }

        case MIDIControllers.registeredParameterLSB:
        case MIDIControllers.registeredParameterMSB:
        case MIDIControllers.nonRegisteredParameterMSB:
        case MIDIControllers.nonRegisteredParameterLSB: {
            // A new selection starts a new message
            channelStatus.pendingParam = undefined;
            // Flag the parameter as not cleared
            channelStatus.clearedParams.selection[ccNum] = false;
            // The output has the file's selection again
            channelStatus.selectionModified[ccNum] = false;
            channelStatus.outputRegistered =
                ccNum === MIDIControllers.registeredParameterMSB ||
                ccNum === MIDIControllers.registeredParameterLSB;

            channelStatus.param.controllerChange(
                ccNum,
                value,
                this.trackNum,
                index
            );
            return;
        }

        case MIDIControllers.dataEntryMSB:
        case MIDIControllers.dataEntryLSB: {
            channelStatus.clearedParams.data = false;
            const data = channelStatus.param.controllerChange(
                ccNum,
                value,
                this.trackNum,
                index
            );
            this.currentParameterChannel = channel;

            // Unrecognized parameters are kept as-is
            switch (data?.type) {
                case "Channel Drum Setup": {
                    if (
                        this.shouldClearChannelDrum(
                            data.channel,
                            data.key,
                            data.parameter
                        )
                    ) {
                        // Drum param, BEGONE!
                        this.deleteCurrentEvent();
                    }
                    break;
                }

                case "Controller Change": {
                    // NRPN can change controllers too!
                    this.handleControllerChange(
                        data.controller,
                        data.value,
                        data.channel
                    );
                    break;
                }

                case "Channel MIDI Param": {
                    this.handleChannelMIDIParam(channel, data, true);
                    break;
                }
            }

            // If the parameters (MSB, LSB and the first data) were cleared.
            // Some MIDIs send param MSB once and then set via LSB only, like:
            // MSB,
            // LSB,
            // Data,
            // LSB,
            // Data,
            // And even though it violates MIDI 1.0, it works...
            // So since we've used those, mark them as "cleaned" so future LSB-only entries won't delete them.
            const [msbCC, lsbCC] = channelStatus.param.paramControllers;
            channelStatus.clearedParams.selection[msbCC] = true;
            channelStatus.clearedParams.selection[lsbCC] = true;

            // This entry is kept, but the output's selection may differ from the file's.
            // Re-insert the file's selection right before it, if so:
            // - Deleted with an earlier cleared data entry, like:
            //   MSB, LSB 1, Data (cleared, deletes MSB and LSB 1),
            //   LSB 2, Data (kept, needs the MSB back)
            // - Changed by the editor's inserted parameters, like:
            //   NRPN MSB, LSB, Data, (inserted RPN on first note on), Data (needs the NRPN back)
            // After that, the selection is unchanged, so following data entries don't need it again.
            // Testcase: midi_editor_nrpn_test.ts (Case: shared NRPN MSB, cleared then kept)
            if (this.currentEventDeleted) return;
            const p = channelStatus.param;
            // A mode switch restores both, as a device may not remember the other mode's selection
            const modeSwitch =
                channelStatus.outputRegistered !== p.isRegistered;
            const restore = [msbCC, lsbCC].filter(
                (cc) => modeSwitch || channelStatus.selectionModified[cc]
            );
            if (restore.length === 0) return;

            const current =
                this.midi.tracks[this.trackNum].events[
                    this.eventIndexes[this.trackNum]
                ];
            const midiChannel = current.statusByte & 0xf;
            for (const cc of restore) {
                // Point the tracker at the restored event, it's the one in use now
                const tracked = p.getParameterSelect(cc);
                tracked.track = this.trackNum;
                tracked.event = this.eventIndexes[this.trackNum];
                this.addEventsBefore(
                    MIDIMessage.controllerChange(
                        current.ticks,
                        midiChannel,
                        cc,
                        tracked.v
                    )
                );
            }
            // A selection resets the data MSB, so the LSB would apply to a zeroed MSB
            if (ccNum === MIDIControllers.dataEntryLSB && p.dataMSB.v !== 0) {
                this.addEventsBefore(
                    MIDIMessage.controllerChange(
                        current.ticks,
                        midiChannel,
                        MIDIControllers.dataEntryMSB,
                        p.dataMSB.v
                    )
                );
            }
            SpessaLog.info(
                `%cRestoring Non/Registered Parameter selection on %c${channelStatus.channel}%c. (Used by a kept data entry)`,
                ConsoleColors.info,
                ConsoleColors.recognized,
                ConsoleColors.info
            );
            return;
        }

        case MIDIControllers.resetAllControllers: {
            // RP-15: the selection is set to null, both in the file and the output.
            channelStatus.param.resetAllControllers();
            channelStatus.pendingParam = undefined;
            channelStatus.clearedParams.selection = {
                [MIDIControllers.registeredParameterMSB]: true,
                [MIDIControllers.registeredParameterLSB]: true,
                [MIDIControllers.nonRegisteredParameterMSB]: true,
                [MIDIControllers.nonRegisteredParameterLSB]: true
            };
            channelStatus.selectionModified = {
                [MIDIControllers.registeredParameterMSB]: false,
                [MIDIControllers.registeredParameterLSB]: false,
                [MIDIControllers.nonRegisteredParameterMSB]: false,
                [MIDIControllers.nonRegisteredParameterLSB]: false
            };
            channelStatus.outputRegistered = channelStatus.param.isRegistered;
            this.handleResetAllControllers(channel);
            return;
        }

        default: {
            return;
        }
    }
}

/**
 * https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf
 * Reset controllers according to RP-15 Recommended Practice.
 *
 * From the PDF:
 * Upon receipt of Reset All Controllers message (Controller #121) the following actions are taken
 *  for the specified MIDI channel:
 *  Set Expression (#11) to 127.
 *  Set Modulation (#1) to 0.
 *  Set Pedals (#64, #65, #66, #67) to 0.
 *  Set Registered and Non-registered parameter number LSB and MSB
 *  (#98-#101) to null value (127)
 *  Set pitch bender to center (64/0)
 *  Reset channel pressure to 0
 *  Reset polyphonic pressure for all notes to 0.
 *  Do NOT reset Bank Select (#0/#32)
 *  Do NOT reset Volume (#7)
 *  Do NOT reset Pan (#10)
 *  Do NOT reset Program Change.
 *  Do NOT reset Effect Controllers (#91-#95)
 *  Do NOT reset Sound Controllers
 *  (#70-#79)
 *  Do NOT reset other channel mode messages (#120-#127).
 *  Do NOT reset registered or non-registered parameters.
 *  Any other controllers that a device can respond to should be set to 0, or the behavior should
 *  be specified and/or documented. If the manufacturer does not want the Reset All Controllers
 *  message to affect a particular controller, that is also permissible, as long as the behavior is
 *  documented.
 *
 *  Note:
 *  GS/XG only reset the specified CCs above.
 */
export function handleResetAllControllers(this: MIDIEditor, channel: number) {
    const track = this.midi.tracks[this.trackNum];
    // Add after this event, on the same tick.
    const index = this.eventIndexes[this.trackNum];
    const ticks = track.events[index].ticks;
    const channelChange = this.channelChanges.get(channel);
    if (!channelChange) return;

    // Restore MIDI parameters
    if (
        channelChange.midiParams?.pitchWheel !== undefined &&
        channelChange.midiParams?.pitchWheel !== "clear"
    ) {
        this.addEventsAfter(
            ...MIDIUtils.setChannelMIDIParameter(
                ticks,
                channel,
                this.system,
                "pitchWheel",
                channelChange.midiParams.pitchWheel
            )
        );
    }
    if (
        channelChange.midiParams?.pressure !== undefined &&
        channelChange.midiParams?.pressure !== "clear"
    ) {
        this.addEventsAfter(
            ...MIDIUtils.setChannelMIDIParameter(
                ticks,
                channel,
                this.system,
                "pressure",
                channelChange.midiParams.pressure
            )
        );
    }
    for (const cc of RP_15_RESET_CC_NUMS) {
        const value = channelChange.controllers?.get(cc);
        if (value !== undefined && value !== "clear") {
            this.addEventsAfter(
                MIDIMessage.controllerChange(ticks, channel, cc, value)
            );
        }
    }
}
