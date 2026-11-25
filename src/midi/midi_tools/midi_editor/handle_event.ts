import type { MIDIMessage } from "../../midi_message";
import * as BankSelectHacks from "../../../utils/bank_select_hacks";
import { type MIDIController, MIDIMessageTypes } from "../../enums";
import type { EditContext } from "./types";
import { deleteCurrentEvent } from "./delete_event";
import { handleSysEx } from "./sysex";
import { handleControllerChange } from "./controller_change";
import { firstNoteOn, trackXGDrumSetup } from "./first_note_on";

/**
 * Handles one event of the file, called by `BasicMIDI.iterate` for every event.
 * Deletes or rewrites what the options lock or clear, tracks the system, channel and parameter state,
 * and inserts the locked state at each channel's first note on.
 * @param ctx The edit context.
 * @param e The event.
 * @param trackNum The index of the track the event is on.
 * @param eventIndexes The current event index of every track, owned by `iterate`. Deleting and inserting adjust it.
 */
export function handleEvent(
    ctx: EditContext,
    e: MIDIMessage,
    trackNum: number,
    eventIndexes: number[]
) {
    ctx.cursor.begin(trackNum, eventIndexes);

    // Port events move their track (tracks without notes too, MuseScore puts the channel setups there).
    // Otherwise only process voice + system exclusive messages
    if (
        ctx.ports.update(e, trackNum) ||
        e.statusByte < MIDIMessageTypes.noteOff ||
        e.statusByte > MIDIMessageTypes.systemExclusive
    )
        return;
    // A port without notes plays nothing, its voice messages are left alone (the sequencer drops them).
    // Its SysEx lands past the last channel, so only the global parameters count, like in the sequencer
    const notePortOffset = ctx.ports.offset(trackNum);
    if (
        notePortOffset === undefined &&
        e.statusByte !== MIDIMessageTypes.systemExclusive
    )
        return;
    const portOffset = notePortOffset ?? ctx.channels.length;

    const status = e.statusByte & 0xf0;
    const midiChannel = e.statusByte & 0xf;
    const channel = midiChannel + portOffset;
    // Clear channel?
    if (
        e.statusByte !== MIDIMessageTypes.systemExclusive &&
        ctx.options.clearedChannels.has(channel)
    ) {
        deleteCurrentEvent(ctx);
        return;
    }
    const channelStatus = ctx.channels[channel];
    const channelChange = ctx.options.channelChanges.get(channel);
    switch (status) {
        case MIDIMessageTypes.noteOn: {
            // Check velocity 0
            if (e.data[1] === 0) {
                // That is a note off
                if (!channelChange) break;
                e.data[0] = Math.max(
                    0,
                    Math.min(
                        127,
                        e.data[0] + channelStatus.noteShifts[e.data[0]]
                    )
                );
                break;
            }
            ctx.resets.sawNote = true;
            // A first note after a reset makes it meaningful, track for replacement
            if (ctx.resets.pending !== undefined) {
                if (ctx.resets.isPendingGM) {
                    // Track as GM, the replacements will be counted as meaningful
                    ctx.resets.gm.push(ctx.resets.pending);
                    ctx.resets.isPendingGM = false;
                } else {
                    ctx.resets.meaningful.push(ctx.resets.pending);
                }
                ctx.resets.pending = undefined;
            }
            // Is it first?
            if (channelStatus.isFirstNoteOn) {
                firstNoteOn(ctx, e.ticks, channel);
                channelStatus.isFirstNoteOn = false;
            }
            // A note voids any pending parameter halves:
            // Rewriting them afterward would change what it heard.
            channelStatus.pendingParam = undefined;
            // Transpose key and clamp if needed
            // For 0 it will stay as is
            const shift =
                channelStatus.relativeKeyShift + channelStatus.currentKeyShift;
            // Remember it for this note's note off
            channelStatus.noteShifts[e.data[0]] = shift;
            e.data[0] = Math.max(0, Math.min(127, e.data[0] + shift));
            break;
        }

        case MIDIMessageTypes.noteOff:
        // Poly pressure is also transposed
        case MIDIMessageTypes.polyPressure: {
            if (!channelChange) break;
            // Use the shift of the held note, not the current one
            e.data[0] = Math.max(
                0,
                Math.min(127, e.data[0] + channelStatus.noteShifts[e.data[0]])
            );
            break;
        }

        case MIDIMessageTypes.programChange: {
            // Do we delete it?
            if (channelChange?.patch) {
                // This channel has program change. BEGONE!
                deleteCurrentEvent(ctx);
                return;
            }
            ctx.cursor.insertAfter(
                ...trackXGDrumSetup(
                    ctx,
                    channel,
                    BankSelectHacks.selectsXGDrumKit(channelStatus.bankMSB),
                    { ticks: e.ticks, partChannel: midiChannel }
                )
            );
            break;
        }

        case MIDIMessageTypes.pitchWheel: {
            // Do we delete it?
            if (channelChange?.midiParams?.pitchWheel !== undefined) {
                // Locked, remove
                deleteCurrentEvent(ctx);
            }
            break;
        }

        case MIDIMessageTypes.channelPressure: {
            // Do we delete it?
            if (channelChange?.midiParams?.pressure !== undefined) {
                // Locked, remove
                deleteCurrentEvent(ctx);
            }
            break;
        }

        case MIDIMessageTypes.controllerChange: {
            const replacement = handleControllerChange(
                ctx,
                e.data[0] as MIDIController,
                e.data[1],
                channel
            );
            if (replacement) {
                // Removed first, so the selection the replacement restores is tracked after the removal
                deleteCurrentEvent(ctx);
                ctx.cursor.insertBefore(...replacement);
            }
            break;
        }

        case MIDIMessageTypes.systemExclusive: {
            handleSysEx(ctx, e, portOffset);
            break;
        }
    }
}
