import { SpessaLog } from "../../../utils/loggin";
import { ConsoleColors } from "../../../utils/other";
import { MIDIMessage } from "../../midi_message";
import { MIDI_DRUM_CHANNEL } from "../../../synthesizer/audio_engine/synth_constants";
import * as MIDIPatchTools from "../../../soundbank/basic_soundbank/midi_patch_tools";
import type { ChannelMIDIParameter } from "../../../synthesizer/audio_engine/channel/parameters/midi";
import * as BankSelectHacks from "../../../utils/bank_select_hacks";
import { MIDIControllers } from "../../enums";
import * as MIDIUtils from "../midi_utils";
import type { DrumParameter } from "../../types";
import { DEFAULT_XG_DRUM_MAP, MELODIC_MAP } from "../sysex_data";
import type { ClearableParameter, EditContext } from "./types";

/**
 * Inserts the locked state of a channel before its first note on (after a reset).
 * The order is the patch, the controllers, the MIDI parameters, the relative fine tune, then the drum setup.
 * @param ctx The edit context.
 * @param ticks The tick of the note on.
 * @param channel The channel, with the port offset.
 */
export function firstNoteOn(ctx: EditContext, ticks: number, channel: number) {
    const channelChange = ctx.options.channelChanges.get(channel);
    // Make sure that we want to modify this channel at all
    if (!channelChange) return;
    const channelStatus = ctx.channels[channel];
    const midiChannel = channel % 16;

    // All right, so this is the first note on for this channel
    // The order is:
    // - patch selection
    // - controllers
    // - parameters
    // - relative fine tune
    // - drum setup

    // Program change
    const patch = channelChange.patch;
    if (patch && patch !== "clear") {
        SpessaLog.info(
            `%cSetting %c${channel}%c to %c${MIDIPatchTools.toMIDIString(patch)}%c. Track num: %c${ctx.cursor.track}`,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info,
            ConsoleColors.recognized
        );

        let desiredBankMSB = patch.bankMSB;
        let desiredBankLSB = patch.bankLSB;
        const desiredProgram = patch.program;

        // The output event order is: drums -> msb -> lsb -> program change
        if (
            midiChannel !== MIDI_DRUM_CHANNEL &&
            patch.isGMGSDrum &&
            !BankSelectHacks.isSystemXG(ctx.system)
        ) {
            // Add gs drum change first
            SpessaLog.info(
                `%cAdding GS Drum change on track %c${ctx.cursor.track}`,
                ConsoleColors.recognized,
                ConsoleColors.value
            );
            ctx.cursor.insertBefore(
                ...MIDIUtils.setChannelMIDIParameter(
                    ticks,
                    midiChannel,
                    "gs",
                    "drumMap",
                    1
                )
            );
            // Track it, so the file's drum map edits for map 1 get checked against this channel
            channelStatus.drumMap = 1;
        } else if (
            !patch.isGMGSDrum &&
            !BankSelectHacks.isSystemXG(ctx.system) &&
            channelStatus.drumMap !== MELODIC_MAP
        ) {
            // A melodic patch on a drum channel, turn the drums off
            SpessaLog.info(
                `%cAdding GS melodic change on track %c${ctx.cursor.track}`,
                ConsoleColors.recognized,
                ConsoleColors.value
            );
            ctx.cursor.insertBefore(
                ...MIDIUtils.setChannelMIDIParameter(
                    ticks,
                    midiChannel,
                    "gs",
                    "drumMap",
                    MELODIC_MAP
                )
            );
            channelStatus.drumMap = MELODIC_MAP;
        }

        if (BankSelectHacks.isSystemXG(ctx.system) && patch.isGMGSDrum) {
            // Best I can do is XG drums
            SpessaLog.info(
                `%cAdding XG Drum change on track %c${ctx.cursor.track}`,
                ConsoleColors.recognized,
                ConsoleColors.value
            );
            desiredBankMSB = BankSelectHacks.getDrumBank(ctx.system);
            desiredBankLSB = 0;
        }
        // The program change below assigns the XG drum setup like the file's own
        trackXGDrumSetup(
            ctx,
            channel,
            patch.isGMGSDrum || BankSelectHacks.selectsXGDrumKit(desiredBankMSB)
        );

        // Add bank change (MSB first)
        ctx.cursor.insertBefore(
            MIDIMessage.controllerChange(
                ticks,
                midiChannel,
                MIDIControllers.bankSelect,
                desiredBankMSB
            ),
            MIDIMessage.controllerChange(
                ticks,
                midiChannel,
                MIDIControllers.bankSelectLSB,
                desiredBankLSB
            )
        );

        // Add program change
        ctx.cursor.insertBefore(
            MIDIMessage.programChange(ticks, midiChannel, desiredProgram)
        );
    }

    // Add absolute tuning to the inserted tune.
    const absoluteTune = channelChange.midiParams?.fineTune;
    let finalTune: number | undefined;

    if (absoluteTune !== undefined && absoluteTune !== "clear") {
        // The parameter "fineTune" has been explicitly set, this is the absolute
        // Add the relative tuning to the absolute MIDI param
        const newTune = channelStatus.relativeFineTune + absoluteTune;
        channelStatus.currentKeyShift = Math.trunc(newTune / 100);
        finalTune = newTune % 100;
    } else if (channelStatus.relativeFineTune !== 0) {
        // Make the relative tuning be set in MIDI parameters.
        // Fine tune in channel MIDI Params is absolute, add the relative one to it.
        // A cleared param still applies the relative tune, if any.
        const newTune =
            channelStatus.relativeFineTune + channelStatus.currentFineTune;
        channelStatus.currentKeyShift = Math.trunc(newTune / 100);
        finalTune = newTune % 100;
    }

    // Add controllers
    if (channelChange.controllers)
        for (const [cc, value] of channelChange.controllers) {
            if (value === "clear") continue;
            const ccChange = MIDIMessage.controllerChange(
                ticks,
                midiChannel,
                cc,
                value
            );
            ctx.cursor.insertBefore(ccChange);
            // A locked bank select replaces the file's, the next program change uses it
            if (cc === MIDIControllers.bankSelect)
                channelStatus.bankMSB = value;
        }

    // Add MIDI parameters
    if (channelChange.midiParams) {
        for (const [param, value] of Object.entries(
            channelChange.midiParams
        ) as {
            [P in keyof ChannelMIDIParameter]: [
                P,
                ClearableParameter<ChannelMIDIParameter[P]>
            ];
        }[keyof ChannelMIDIParameter][]) {
            // Fine tune is inserted below from the calculated value above,
            // Don't set it here
            if (
                value === "clear" ||
                param === "fineTune" ||
                // Random pan may not be added if pan is explicitly set
                (param === "randomPan" &&
                    !value &&
                    // Clearing the pan does not stop the random pan, so specific number.
                    typeof channelChange?.controllers?.get(
                        MIDIControllers.pan
                    ) === "number")
            )
                continue;
            ctx.cursor.insertBefore(
                ...MIDIUtils.setChannelMIDIParameter(
                    ticks,
                    midiChannel,
                    ctx.system,
                    param,
                    value
                )
            );
            // A locked drum map is tracked like the file's
            if (param === "drumMap") {
                channelStatus.drumMap = value;
            }
        }
    }

    // Insert the target fine tune
    if (finalTune !== undefined) {
        ctx.cursor.insertBefore(
            ...MIDIUtils.setChannelMIDIParameter(
                ticks,
                midiChannel,
                ctx.system,
                "fineTune",
                finalTune
            )
        );
    }

    // Add drum setup parameters
    if (!channelChange.drumParams || channelChange.drumParams === "clear")
        return;
    // Match the synthesizer's drum pitch resolution:
    // XG and the SC-55 map (bank LSB 1) use 100 cents, otherwise 50 cents
    const drumPitchStep =
        ctx.system === "xg" ||
        (patch !== undefined && patch !== "clear" && patch.bankLSB === 1)
            ? 1
            : 0.5;
    for (const [key, noteParams] of channelChange.drumParams) {
        // Note cleared
        if (noteParams === "clear") continue;
        for (const [param, value] of Object.entries(noteParams) as {
            [P in keyof DrumParameter]: [
                P,
                ClearableParameter<DrumParameter[P]>
            ];
        }[keyof DrumParameter][]) {
            // Parameter cleared
            if (value === "clear" || value === undefined) continue;
            ctx.cursor.insertBefore(
                ...MIDIUtils.setDrumChannelParameter(
                    ticks,
                    midiChannel,
                    key,
                    param,
                    value,
                    drumPitchStep
                )
            );
        }
    }
}

/**
 * Tracks the XG drum setup a program change assigns, like the synth.
 * A part in normal mode switched to a drum kit uses Drum Setup 2, and a melodic voice brings it back to normal.
 * Part 10 keeps Drum Setup 1. A part set to the plain drum mode (no setup) is left alone.
 * @param ctx The edit context.
 * @param channel The channel of the program change.
 * @param isDrum If the program change selects a drum kit.
 * @param programChange The file's program change message. A locked drum map is written again after it.
 * @returns The messages that lock the drum map again, to insert right after the program change.
 */
export function trackXGDrumSetup(
    ctx: EditContext,
    channel: number,
    isDrum: boolean,
    programChange?: MIDIMessage
) {
    if (ctx.system !== "xg" || channel % 16 === MIDI_DRUM_CHANNEL) return [];
    const channelStatus = ctx.channels[channel];
    const drumSetup2 = DEFAULT_XG_DRUM_MAP + 1;
    let map = channelStatus.drumMap;
    if (isDrum && map === MELODIC_MAP) map = drumSetup2;
    else if (!isDrum && map === drumSetup2) map = MELODIC_MAP;
    if (map === channelStatus.drumMap) return [];
    // A locked drum map stays locked: it is written again right after the file's program change that switched it
    const locked = ctx.options.channelChanges.get(channel)?.midiParams?.drumMap;
    if (programChange && locked !== undefined && locked !== "clear") {
        return MIDIUtils.setChannelMIDIParameter(
            programChange.ticks,
            channel % 16,
            ctx.system,
            "drumMap",
            locked
        );
    }
    channelStatus.drumMap = map;
    return [];
}
