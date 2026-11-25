import type { MIDIMessage } from "../../midi_message";
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
    const syxs = MIDIUtils.analyzeSysEx(e.data);
    // Drum map locks to write again, inserted after all the results (inserting moves the current index)
    const relock = new Array<MIDIMessage>();
    // The entries to keep, or the messages that replace one (like a corrected fine tune), in entry order
    const kept = new Array<AnalyzedMessage.SysEx | MIDIMessage[]>();
    let replaced = false;
    // We delete some messages whole instead of splitting them, at their first changed entry
    // (so the entries after it are not tracked either):
    // - An entry on a channel above 15 (like a GS block B part) would go back as a channel message
    //   (or a corrected fine tune RPN as channel % 16), which can't reach that channel from this track.
    //   Writing those entries to a track on that channel's port would fix it.
    // - In GM mode the synth ignores GS and XG part messages, but not the channel messages
    //   Their entries would come back as.
    const splittable = syxs.every(
        (s) =>
            !("channel" in s) ||
            (s.channel < 16 &&
                (ctx.system !== "gm" || MIDIUtils.systemOf(e) === "gm2"))
    );
    // A "continue" in this loop drops the entry, everything else reaches kept.push at the bottom
    for (const [index, syx] of syxs.entries()) {
        // Only a cleared reset deletes the message here, and a reset is always the only result
        if (ctx.cursor.deleted) return;
        if (!splittable && (replaced || kept.length < index)) break;

        // Clear channel sysExes too
        if (
            "channel" in syx &&
            ctx.options.clearedChannels.has(syx.channel + portOffset)
        ) {
            // BEGONE, CHANNEL CHANGE!
            continue;
        }
        // Testcase: XG_[Th07] (MU2000EX Arrangements)/th07_19.mid
        if (
            "channel" in syx &&
            syx.channel + portOffset >= ctx.channels.length
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
                // SysEx can change programs
                // Do we delete it?
                if (
                    ctx.options.channelChanges.get(syx.channel + portOffset)
                        ?.patch
                )
                    // This channel has program change. BEGONE!
                    continue;
                const sysExChannel = syx.channel + portOffset;
                relock.push(
                    ...trackXGDrumSetup(
                        ctx,
                        sysExChannel,
                        BankSelectHacks.selectsXGDrumKit(
                            ctx.channels[sysExChannel].bankMSB
                        ),
                        // Note: a block B part (17 and up) does not get its locked drum map written again.
                        // The written message addresses channel % 16 on this track's port, so it would hit the wrong part
                        syx.channel < 16 ? e : undefined
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
                    syx.channel + portOffset,
                    syx
                );
                if (replacement) {
                    kept.push(replacement);
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
                    syx.channel + portOffset
                );
                if (replacement) {
                    kept.push(replacement);
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
    if (splittable) {
        const system = MIDIUtils.systemOf(e);
        const options = {
            // XG keeps the message type in the high nibble (1n parameter change), only the device number carries over
            deviceID: system === "xg" ? 0x10 | (e.data[1] & 0x0f) : e.data[1],
            ticks: e.ticks,
            preferredSystem: system
        };
        for (const keep of kept) {
            ctx.cursor.insertBefore(
                ...(Array.isArray(keep)
                    ? keep
                    : MIDIUtils.fromAnalyzedMessage(keep, options))
            );
        }
    }
    deleteCurrentEvent(ctx);
    ctx.cursor.insertAfter(...relock);
}
