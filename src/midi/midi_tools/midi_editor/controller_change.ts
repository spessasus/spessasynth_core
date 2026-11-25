import { SpessaLog } from "../../../utils/loggin";
import { ConsoleColors } from "../../../utils/other";
import { MIDIMessage } from "../../midi_message";
import { MIDI_DRUM_CHANNEL } from "../../../synthesizer/audio_engine/synth_constants";
import * as BankSelectHacks from "../../../utils/bank_select_hacks";
import {
    type MIDIController,
    MIDIControllers,
    MIDIMessageTypes
} from "../../enums";
import * as MIDIUtils from "../midi_utils";
import { RP_15_RESET_CC_NUMS } from "../../../synthesizer/audio_engine/channel/reset";
import type * as AnalyzedMessage from "../analyzed_message";
import { MELODIC_MAP } from "../sysex_data";
import type { ChannelStatus, EditContext } from "./types";
import type { PortTracker } from "../port_tracker";
import { clearedSelection, unmodifiedSelection } from "./channel_status";
import { shouldClearChannelDrum } from "./locks";

/**
 * Handles a channel MIDI parameter change, from an RPN or a SysEx.
 * Removes it if the parameter (or the drum mode, through a locked patch) is locked,
 * replaces it with the relative fine tune added to the file's fine tune, and tracks the drum map.
 * @param ctx The edit context.
 * @param channel The channel, with the port offset.
 * @param data The analyzed parameter change.
 * @param isRPN If the change comes from an RPN (data entry), not a SysEx.
 * @returns Undefined to keep the change, or the messages that replace it (empty to remove it).
 * The caller removes it and inserts them in its place, so a SysEx can keep its other entries.
 */
export function handleChannelMIDIParam(
    ctx: EditContext,
    channel: number,
    data: Extract<AnalyzedMessage.Any, { type: "Channel MIDI Param" }>,
    isRPN = false
) {
    const channelStatus = ctx.channels[channel];
    if (!channelStatus) return;
    const channelChange = ctx.options.channelChanges.get(channel);

    // Locked, remove
    // The first note on inserts the locked value with the relative tune added, so we delete it here
    if (channelChange?.midiParams?.[data.parameter] !== undefined) return [];
    // A locked patch owns the drum mode too, like bank select.
    // A cleared patch only removes program changes and bank selects, the drum mode stays
    if (
        data.parameter === "drumMap" &&
        channelChange?.patch &&
        channelChange.patch !== "clear"
    )
        return [];
    // Track the drum map, only if the message stays
    if (data.parameter === "drumMap") {
        // Like the synth's part mode on XG (and GM2): the bank follows the mode
        // Before the next program change, and the XG drum part refuses to turn melodic
        if (BankSelectHacks.isSystemXG(ctx.system)) {
            const isDrum = data.value !== MELODIC_MAP;
            if (
                !isDrum &&
                ctx.system === "xg" &&
                channel % 16 === MIDI_DRUM_CHANNEL
            )
                return;
            if (!isDrum)
                channelStatus.bankMSB = BankSelectHacks.getDefaultBank(
                    ctx.system
                );
            else if (!BankSelectHacks.isXGDrum(channelStatus.bankMSB))
                channelStatus.bankMSB = BankSelectHacks.getDrumBank(ctx.system);
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

    // And update this tuning: the file's change is removed, the corrected one is written instead.
    // Don't update tuning if no notes have played.
    if (channelStatus.isFirstNoteOn) {
        return [];
    }
    const e = ctx.cursor.event;

    // Build the replacement rpn
    const newRPN = MIDIUtils.fromAnalyzedMessage(
        {
            type: "Channel MIDI Param",
            channel: channel % 16,
            parameter: "fineTune",
            value: targetTune
        },
        { ticks: e.ticks, preferredSystem: ctx.system }
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
        return [];
    }

    // Track the replacement, only for RPN change.
    // A not-RPN message voids any pending pair instead:
    // A later half belongs to a new message, not the old one.
    channelStatus.pendingParam = isRPN ? { events: newRPN } : undefined;
    // For a data entry, the caller inserts it after removing the file's change:
    // Removing marks the selection as modified, then inserting the RPN marks it as restored again
    return newRPN;
}

/**
 * Handles a controller change, from a CC message or a SysEx.
 * Removes locked controllers, tracks the RPN/NRPN selection and data entry
 * (a locked parameter removes the whole RPN/NRPN message) and handles Reset All Controllers.
 * @param ctx The edit context.
 * @param ccNum The controller number.
 * @param value The controller value.
 * @param channel The channel, with the port offset.
 * @returns Undefined to keep the change, or the messages that replace it (empty to remove it).
 * The caller removes it and inserts them in its place, so a SysEx can keep its other entries.
 */
export function handleControllerChange(
    ctx: EditContext,
    ccNum: MIDIController,
    value: number,
    channel: number
) {
    // Change may be undefined but don't check, because we may encounter a "clear Drum param" request while the channel is not changed
    // This still involves removing the drum NRPN
    // Also param tracking
    const channelChange = ctx.options.channelChanges.get(channel);
    const channelStatus = ctx.channels[channel];

    const index = ctx.cursor.index;
    const change = channelChange?.controllers?.get(ccNum);
    if (change !== undefined) {
        // This controller is locked, BEGONE CHANGE!
        return [];
    }
    switch (ccNum) {
        case MIDIControllers.bankSelect:
        case MIDIControllers.bankSelectLSB: {
            if (channelChange?.patch) {
                // BEGONE!
                return [];
            }
            if (ccNum === MIDIControllers.bankSelect)
                channelStatus.bankMSB = value;
            return;
        }

        case MIDIControllers.pan: {
            // Random pan gets disabled by regular pan, prevent that here
            return channelChange?.midiParams?.randomPan === true
                ? []
                : undefined;
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
                ctx.cursor.track,
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
                ctx.cursor.track,
                index
            );
            ctx.cursor.parameterChannel = channel;

            // Unrecognized parameters are kept as-is
            let replacement: MIDIMessage[] | undefined;
            switch (data?.type) {
                case "Channel Drum Setup": {
                    if (
                        shouldClearChannelDrum(
                            ctx.options.channelChanges,
                            data.channel,
                            data.key,
                            data.parameter
                        )
                    ) {
                        // Drum param, BEGONE!
                        replacement = [];
                    }
                    break;
                }

                case "Controller Change": {
                    // NRPN can change controllers too!
                    replacement = handleControllerChange(
                        ctx,
                        data.controller,
                        data.value,
                        data.channel
                    );
                    break;
                }

                case "Channel MIDI Param": {
                    replacement = handleChannelMIDIParam(
                        ctx,
                        channel,
                        data,
                        true
                    );
                    break;
                }
            }
            // The caller removes the whole parameter (parameterChannel is set above),
            // Which also marks its selection as cleared, so the rest of this case does not apply
            if (replacement) return replacement;

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
            const p = channelStatus.param;
            // A mode switch restores both, as a device may not remember the other mode's selection
            const modeSwitch =
                channelStatus.outputRegistered !== p.isRegistered;
            const restore = [msbCC, lsbCC].filter(
                (cc) => modeSwitch || channelStatus.selectionModified[cc]
            );
            if (restore.length === 0) return;

            const current = ctx.cursor.event;
            const midiChannel = current.statusByte & 0xf;
            for (const cc of restore) {
                // Point the tracker at the restored event, it's the one in use now
                const tracked = p.getParameterSelect(cc);
                tracked.track = ctx.cursor.track;
                tracked.event = ctx.cursor.index;
                ctx.cursor.insertBefore(
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
                ctx.cursor.insertBefore(
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
            channelStatus.clearedParams.selection = clearedSelection();
            channelStatus.selectionModified = unmodifiedSelection();
            channelStatus.outputRegistered = channelStatus.param.isRegistered;
            handleResetAllControllers(ctx, channel);
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
 * @param ctx The edit context.
 * @param channel The channel, with the port offset.
 */
export function handleResetAllControllers(ctx: EditContext, channel: number) {
    // Add after this event, on the same tick.
    const ticks = ctx.cursor.event.ticks;
    const channelChange = ctx.options.channelChanges.get(channel);
    if (!channelChange) return;

    // Restore MIDI parameters
    if (
        channelChange.midiParams?.pitchWheel !== undefined &&
        channelChange.midiParams?.pitchWheel !== "clear"
    ) {
        ctx.cursor.insertAfter(
            ...MIDIUtils.fromAnalyzedMessage(
                {
                    type: "Channel MIDI Param",
                    channel: channel % 16,
                    parameter: "pitchWheel",
                    value: channelChange.midiParams.pitchWheel
                },
                { ticks, preferredSystem: ctx.system }
            )
        );
    }
    if (
        channelChange.midiParams?.pressure !== undefined &&
        channelChange.midiParams?.pressure !== "clear"
    ) {
        ctx.cursor.insertAfter(
            ...MIDIUtils.fromAnalyzedMessage(
                {
                    type: "Channel MIDI Param",
                    channel: channel % 16,
                    parameter: "pressure",
                    value: channelChange.midiParams.pressure
                },
                { ticks, preferredSystem: ctx.system }
            )
        );
    }
    for (const cc of RP_15_RESET_CC_NUMS) {
        const value = channelChange.controllers?.get(cc);
        if (value !== undefined && value !== "clear") {
            ctx.cursor.insertAfter(
                MIDIMessage.controllerChange(ticks, channel, cc, value)
            );
        }
    }
}

/**
 * Tracks the N/RPN selection controllers inserted by the editor.
 * They change the output's selection, which may no longer match what the file selected.
 * Testcase: midi_editor_nrpn_test.ts (Case: inserted RPN before a file's LSB-only NRPN)
 * @param ports The port tracker, for the channel of the event.
 * @param channels The tracked state of every channel.
 * @param e The inserted event.
 * @param track The track the event was inserted on.
 */
export function trackInsertedSelection(
    ports: PortTracker,
    channels: ChannelStatus[],
    e: MIDIMessage,
    track: number
) {
    if ((e.statusByte & 0xf0) !== MIDIMessageTypes.controllerChange) return;
    const cc = e.data[0];
    if (
        // eslint-disable-next-line unicorn/prefer-includes-over-repeated-comparisons -- the comparisons narrow cc to ParameterCC
        cc !== MIDIControllers.registeredParameterMSB &&
        cc !== MIDIControllers.registeredParameterLSB &&
        cc !== MIDIControllers.nonRegisteredParameterMSB &&
        cc !== MIDIControllers.nonRegisteredParameterLSB
    )
        return;
    const portOffset = ports.offset(track) ?? channels.length;
    const ch = channels[(e.statusByte & 0xf) + portOffset];
    if (!ch) return;
    ch.selectionModified[cc] = e.data[1] !== ch.param.getParameterSelect(cc).v;
    ch.outputRegistered =
        cc === MIDIControllers.registeredParameterMSB ||
        cc === MIDIControllers.registeredParameterLSB;
}
