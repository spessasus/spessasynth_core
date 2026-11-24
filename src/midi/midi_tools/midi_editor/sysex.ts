import type { MIDIMessage } from "../../midi_message";
import * as BankSelectHacks from "../../../utils/bank_select_hacks";
import * as MIDIUtils from "../midi_utils";
import type { AnalyzedMIDIMessage } from "../analyzed_message";
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
    Record<AnalyzedMIDIMessage["type"], keyof ModifyMIDIOptions>
>;

/**
 * Handles a system exclusive event, called by `handleEvent`.
 * Deletes it if anything in it is locked or cleared (a User Drum Set bulk dump keeps its unlocked entries),
 * handles resets and tracks the program, drum map and parameter state the message changes.
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
    // A User Drum Set bulk dump sets many notes at once.
    // Only its locked entries get removed, the rest is written back as single messages in the same order
    // (up to 128 messages for one packet, only when something in it is locked).
    // That is only exact when it is not the flags packet (its internal bit has no real time message)
    // And uses the default device ID, which the single messages are written with.
    //
    // TODO: Other dumps are deleted whole when anything in them is locked.
    // So their unlocked entries are lost too.
    // Note: the encoder can write the device ID now, using it here (and dropping the 0x10 check)
    // Is part of the planned partial delete for every dump type.
    if (
        syxs.length > 1 &&
        e.data[1] === 0x10 &&
        (e.data[5] & 0x0f) !== 0x6 &&
        syxs.every((s) => s.type === "User Drum Setup")
    ) {
        const kept = syxs.filter(
            (s) =>
                !isUserDrumLocked(
                    ctx.options.userDrumParams,
                    s.drumSet,
                    s.midiNote,
                    s.parameter
                )
        );
        if (kept.length < syxs.length) {
            deleteCurrentEvent(ctx);
            ctx.cursor.insertBefore(
                ...kept.flatMap((s) =>
                    MIDIUtils.fromAnalyzedMessage(s, { ticks: e.ticks })
                )
            );
        }
        return;
    }
    // Drum map locks to write again, inserted after all the results (inserting moves the current index)
    const relock = new Array<MIDIMessage>();
    for (const syx of syxs) {
        if (ctx.cursor.deleted) return;
        // Clear channel sysExes too
        if (
            "channel" in syx &&
            ctx.options.clearedChannels.has(syx.channel + portOffset)
        ) {
            // BEGONE, CHANNEL CHANGE!
            deleteCurrentEvent(ctx);
            return;
        }
        // Testcase: XG_[Th07] (MU2000EX Arrangements)/th07_19.mid
        if ("channel" in syx && syx.channel + portOffset >= ctx.channels.length)
            continue;

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
                    deleteCurrentEvent(ctx);
                    return;
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
                if (option) {
                    deleteCurrentEvent(ctx);
                    return;
                }
                break;
            }

            case "XG Insertion Param": {
                // Delete all insertion params since we're setting new ones
                if (ctx.options.xgInsertionParams?.get(syx.insertionNumber)) {
                    deleteCurrentEvent(ctx);
                    return;
                }
                break;
            }

            case "Program Change": {
                // SysEx can change programs
                // Do we delete it?
                if (
                    ctx.options.channelChanges.get(syx.channel + portOffset)
                        ?.patch
                ) {
                    // This channel has program change. BEGONE!
                    deleteCurrentEvent(ctx);

                    return;
                }
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
                    return;
                }
                if (ctx.options.midiParams?.[syx.parameter] !== undefined) {
                    // Locked, remove
                    deleteCurrentEvent(ctx);
                    return;
                }
                break;
            }

            case "Channel MIDI Param": {
                handleChannelMIDIParam(ctx, syx.channel + portOffset, syx);
                break;
            }

            case "Controller Change": {
                // SysEx can change controllers too!
                handleControllerChange(
                    ctx,
                    syx.controller,
                    syx.value,
                    syx.channel + portOffset
                );
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
                ) {
                    deleteCurrentEvent(ctx);
                    return;
                }
            }
        }
    }
    if (!ctx.cursor.deleted) ctx.cursor.insertAfter(...relock);
}
