import type { MIDIMessage } from "../../midi_message";
import { SpessaLog } from "../../../utils/loggin";
import * as BankSelectHacks from "../../../utils/bank_select_hacks";
import * as MIDIUtils from "../midi_utils";
import type * as AnalyzedMessage from "../analyzed_message";
import type { EditContext, ModifyMIDIOptions } from "./types";
import { deleteCurrentEvent } from "./delete_event";
import {
    handleChannelMIDIParam,
    handleControllerChange
} from "./controller_change";
import { trackXGDrumSetup } from "./first_note_on";
import { handleReset } from "./reset";
import { isUserDrumLocked, shouldClearMapDrum } from "./locks";

/**
 * The option that replaces each effect, its file messages are deleted when it is set (or cleared).
 */
const EFFECT_OPTIONS = {
    "GS Reverb Param": "gsReverbParams",
    "GS Chorus Param": "gsChorusParams",
    "GS Delay Param": "gsDelayParams",
    "GS Equalizer Param": "gsEqualizerParams",
    "GS Insertion Param": "gsInsertionParams",
    "XG Reverb Param": "xgReverbParams",
    "XG Chorus Param": "xgChorusParams",
    "XG Variation Param": "xgVariationParams"
} as const satisfies Partial<
    Record<AnalyzedMessage.Any["type"], keyof ModifyMIDIOptions>
>;

/**
 * Handles a system exclusive event, called by `handleEvent`.
 * Removes the entries that are locked or cleared.
 * A message with several entries (like a bulk dump)
 * Keeps the others, written again as single messages with its device ID.
 * Also handles resets and tracks the program, drum map and parameter state the message changes.
 * @param ctx The edit context.
 * @param e The event.
 * @param portOffset The first channel of the track's port, or the channel count for a port without notes.
 */
export function handleSysEx(
    ctx: EditContext,
    e: MIDIMessage,
    portOffset: number
) {
    // The analyzer resolves the part channels from the port, like the synth.
    // A port without notes has no channels: its part entries are kept as they are, analyzed from the first port
    // So they can be written back unchanged
    const noChannels = portOffset >= ctx.channels.length;
    const trackOffset = noChannels ? 0 : portOffset;
    const syxs = MIDIUtils.analyzeSysEx(e.data, trackOffset / 16);
    // Drum map locks to write again, inserted after all the results (inserting moves the current index)
    const relock = new Array<MIDIMessage>();
    // The entries to keep, or the channel messages that replace one (like a corrected fine tune) with their channel,
    // In entry order
    const kept = new Array<
        AnalyzedMessage.SysEx | { channel: number; messages: MIDIMessage[] }
    >();
    let replaced = false;
    // A "continue" in this loop drops the entry, everything else reaches kept.push at the bottom
    for (const syx of syxs) {
        // Only a cleared reset deletes the message here, and a reset is always the only result
        if (ctx.cursor.deleted) return;

        // Clear channel sysExes too.
        // Not from a port without channels: its part entries reach no part, so no edit applies to them
        if (
            !noChannels &&
            "channel" in syx &&
            ctx.options.clearedChannels.has(syx.channel)
        ) {
            // BEGONE, CHANNEL CHANGE!
            continue;
        }
        // Testcase: XG_[Th07] (MU2000EX Arrangements)/th07_19.mid
        if (
            "channel" in syx &&
            (noChannels || syx.channel >= ctx.channels.length)
        ) {
            // Kept as it is, the file has no such channel to track
            kept.push(syx);
            continue;
        }

        switch (syx.type) {
            case "Map Drum Setup": {
                // Delete map drum setups affecting modified channels
                if (
                    shouldClearMapDrum(
                        ctx.options.channelChanges,
                        ctx.channels,
                        syx.drumMap,
                        syx.key,
                        syx.parameter
                    )
                ) {
                    continue;
                }
                break;
            }

            case "GS Reverb Param":
            case "GS Chorus Param":
            case "GS Delay Param":
            case "GS Equalizer Param":
            case "GS Insertion Param":
            case "XG Reverb Param":
            case "XG Chorus Param":
            case "XG Variation Param": {
                // Delete all params of this effect since we're setting new ones
                const option = ctx.options[EFFECT_OPTIONS[syx.type]];
                if (option) continue;
                break;
            }

            case "XG Insertion Param": {
                // Delete all insertion params since we're setting new ones
                if (ctx.options.xgInsertionParams?.get(syx.insertionNumber))
                    continue;
                break;
            }

            case "Program Change": {
                // SysEx can change programs.
                // The editor follows the synth here, it ignores the GS/XG receive switches for program change
                // And bank select (they analyze as Other With Data and stay in the file as they are)
                // Do we delete it?
                if (ctx.options.channelChanges.get(syx.channel)?.patch)
                    // This channel has program change. BEGONE!
                    continue;
                const sysExChannel = syx.channel;
                relock.push(
                    ...trackXGDrumSetup(
                        ctx,
                        sysExChannel,
                        BankSelectHacks.selectsXGDrumKit(
                            ctx.channels[sysExChannel].bankMSB
                        ),
                        // The part message is written from this track, relative to its port
                        {
                            ticks: e.ticks,
                            partChannel: syx.channel - trackOffset
                        }
                    )
                );
                break;
            }

            case "Global MIDI Param": {
                if (syx.parameter === "system") {
                    handleReset(ctx, syx.value, e);
                } else if (
                    ctx.options.midiParams?.[syx.parameter] !== undefined
                ) {
                    // Locked, remove
                    continue;
                }
                break;
            }

            case "Channel MIDI Param": {
                const replacement = handleChannelMIDIParam(
                    ctx,
                    syx.channel,
                    syx
                );
                if (replacement) {
                    kept.push({
                        channel: syx.channel,
                        messages: replacement
                    });
                    replaced = true;
                    continue;
                }
                break;
            }

            case "Controller Change": {
                // SysEx can change controllers too!
                const replacement = handleControllerChange(
                    ctx,
                    syx.controller,
                    syx.value,
                    syx.channel
                );
                if (replacement) {
                    kept.push({
                        channel: syx.channel,
                        messages: replacement
                    });
                    replaced = true;
                    continue;
                }
                break;
            }

            case "User Drum Setup": {
                if (
                    isUserDrumLocked(
                        ctx.options.userDrumParams,
                        syx.drumSet,
                        syx.midiNote,
                        syx.parameter
                    )
                )
                    // Locked, remove
                    continue;
            }
        }
        kept.push(syx);
    }

    if (!replaced && kept.length === syxs.length) {
        if (!ctx.cursor.deleted) ctx.cursor.insertAfter(...relock);
        return;
    }

    // Write the kept entries again in place of the message.
    // They come back as single messages, not one dump, and re-encoding is not byte exact
    // (a GS drum setup at address 51 comes back at 41, the flags packet loses its internal bit 3).
    // That's fine because it only happens when something in the message is locked,
    // Untouched messages keep their bytes.
    const system = MIDIUtils.systemOf(e);
    const options = {
        // XG keeps the message type in the high nibble (1n parameter change), only the device number carries over
        deviceID: system === "xg" ? 0x10 | (e.data[1] & 0x0f) : e.data[1],
        ticks: e.ticks,
        preferredSystem: system
    };
    for (const keep of kept) {
        if ("messages" in keep) {
            insertOnChannelPort(ctx, keep.channel, keep.messages);
            continue;
        }
        // A channel message reaches only its channel's port, so one for another port (like GS block B) goes there.
        // A SysEx reaches its part from this track like the file's message
        // A port without channels writes its part entries back as SysEx on this track, as they were
        if (!noChannels && "channel" in keep) {
            const channelMessages = MIDIUtils.encodeChannelMessage(
                { ...keep, channel: keep.channel % 16 },
                e.ticks,
                MIDIUtils.DEFAULT_MIDI_ENCODE_OPTIONS.drumPitchStep
            );
            if (channelMessages) {
                insertOnChannelPort(ctx, keep.channel, channelMessages);
                continue;
            }
        }
        // The encoder writes the part for this track's port, so the channel goes back to being relative to it
        ctx.cursor.insertBefore(
            ...MIDIUtils.fromAnalyzedMessage(
                "channel" in keep
                    ? { ...keep, channel: keep.channel - trackOffset }
                    : keep,
                options
            )
        );
    }
    deleteCurrentEvent(ctx);
    ctx.cursor.insertAfter(...relock);
}

/**
 * Inserts channel messages before the current event, on the port of their channel.
 * Drops them when that is not possible, see the comments below.
 * @param ctx The edit context.
 * @param channel The channel, with the port offset.
 * @param messages The messages, written for channel % 16.
 */
function insertOnChannelPort(
    ctx: EditContext,
    channel: number,
    messages: MIDIMessage[]
) {
    // A locked entry comes back as no messages
    if (messages.length === 0) return;
    const track = ctx.cursor.track;
    const offset = channel - (channel % 16);
    // A port without notes has the channel count as its offset
    if ((ctx.ports.offset(track) ?? ctx.channels.length) === offset) {
        ctx.cursor.insertBefore(...messages);
        return;
    }
    const port = ctx.ports.portWithOffset(offset);
    // The two drops below lose an entry the file applied, and the channel state was already updated as if
    // It stayed. We keep dropping instead of writing the entry back as a part SysEx because both cases are rare
    // And the port model rework (one port map for the whole file) removes them
    if (port === undefined) {
        // No port with notes has that channel. Usually the file's message reached nothing either,
        // But a GS Double Module mode set gives a single port file 32 synth channels, so block B did play.
        // A message from a port without notes played nothing at all, it needs no warning
        if (ctx.ports.offset(track) === undefined) return;
        SpessaLog.warn(
            `Dropping a message for channel ${channel}, no port with notes has that channel.`
        );
        return;
    }
    if (
        !ctx.cursor.insertBeforeOnPort(port, ctx.ports.port(track), ...messages)
    )
        // A port event on this track would change the port channels of the whole file.
        // This needs a note track without any port event sending a part message for another port,
        // Like the name-routed Yamaha MU demos
        SpessaLog.warn(
            `Dropping a message for channel ${channel}: writing it on its port would change the file's port routing.`
        );
}
