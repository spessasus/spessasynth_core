import { MIDIMessage } from "../midi_message";
import { IndexedByteArray } from "../../utils/indexed_array";
import { SpessaLog } from "../../utils/loggin";
import { ConsoleColors } from "../../utils/other";

import { DEFAULT_PERCUSSION } from "../../synthesizer/audio_engine/synth_constants";

import { BankSelectHacks } from "../../utils/midi_hacks";
import {
    type MIDIController,
    MIDIControllers,
    type MIDIMessageType,
    MIDIMessageTypes
} from "../enums";
import type { BasicMIDI } from "../basic_midi";
import {
    type MIDIPatch,
    MIDIPatchTools
} from "../../soundbank/basic_soundbank/midi_patch";
import type {
    ChorusProcessorSnapshot,
    DelayProcessorSnapshot,
    InsertionProcessorSnapshot,
    ReverbProcessorSnapshot
} from "../../synthesizer/audio_engine/effects/types";
import { MIDIUtils } from "./midi_utils";
import type { MIDISystem } from "../../soundbank/types";
import { ParameterTracker } from "./parameter_tracker";

const reverbAddressMap: ReverbProcessorSnapshot = {
    character: 0x31,
    preLowpass: 0x32,
    level: 0x33,
    time: 0x34,
    delayFeedback: 0x35,
    preDelayTime: 0x37
};

const chorusAddressMap: ChorusProcessorSnapshot = {
    preLowpass: 0x39,
    level: 0x3a,
    feedback: 0x3b,
    delay: 0x3c,
    rate: 0x3d,
    depth: 0x3e,
    sendLevelToReverb: 0x3f,
    sendLevelToDelay: 0x40
};

const delayAddressMap: DelayProcessorSnapshot = {
    preLowpass: 0x51,
    timeCenter: 0x52,
    timeRatioLeft: 0x53,
    timeRatioRight: 0x54,
    levelCenter: 0x55,
    levelLeft: 0x56,
    levelRight: 0x57,
    level: 0x58,
    feedback: 0x59,
    sendLevelToReverb: 0x5a
};

function getControllerChange(
    channel: number,
    cc: number,
    value: number,
    ticks: number
): MIDIMessage {
    return new MIDIMessage(
        ticks,
        (MIDIMessageTypes.controllerChange | (channel % 16)) as MIDIMessageType,
        new IndexedByteArray([cc, value])
    );
}

/**
 * Represents a value that means "clear this parameter" instead of "replace this parameter with".
 * Essentially:
 * - undefined - no change.
 * - `clear` - clear all changes of this parameter from the MIDI file.
 * - T - clear all changes of this parameter from the MIDI file and add T.
 */
export type ClearableParameter<T> = T | "clear";

export interface ChannelModification {
    /**
     * All controllers that should be modified for this channel.
     * - Key: the MIDI controller number.
     * - value:
     *   - `"clear"` - all controller changes for this controller are removed.
     *   - `number` - clear + sets the new controller at the start of the song, effectively locking them to the set value.
     */
    controllers?: Map<MIDIController, ClearableParameter<number>>;

    /**
     * The new program of this channel.
     * - `"clear"` - all program changes for this channel are removed.
     * - `MIDIPatch` - clear + sets the new patch according to the MIDI system at the start of the sequence.
     */
    patch?: ClearableParameter<MIDIPatch>;

    /**
     * The channel key shift in semitones.
     * Note on/off numbers are shifted.
     */
    keyShift?: number;

    /**
     * The channel tuning in cents.
     * Tuned using RPN Fine Tune.
     * Range is `[-100; 99.986]` cents.
     */
    fineTune?: number;
}

export interface ModifyMIDIOptions {
    /**
     * The channel changes.
     * - Key: the MIDI channel number.
     * - value:
     *   - `"clear"` - all MIDI messages for this channel, such as Note On are removed.
     *   - `ChannelModification` - modifies the channel.
     */
    channels?: Map<number, ClearableParameter<ChannelModification>>;
    /**
     * The drum parameter changes.
     * - `"clear"` - all existing drum parameter change MIDI messages are removed.
     * - `never` - not yet implemented.
     */
    drumSetupParams?: ClearableParameter<never>; // Only clear for now
    /**
     * The desired GS reverb parameters.
     * - `"clear"` - all existing parameter change MIDI messages are removed.
     * - `ReverbProcessorSnapshot` - clear + the new parameters are set via System Exclusive messages.
     */
    reverbParams?: ClearableParameter<ReverbProcessorSnapshot>;
    /**
     * The GS chorus parameters.
     * - `"clear"` - all existing parameter change MIDI messages are cleared.
     * - `ChorusProcessorSnapshot` - clear + the new parameters are set via System Exclusive messages.
     */
    chorusParams?: ClearableParameter<ChorusProcessorSnapshot>;
    /**
     * The GS delay parameters.
     * - `"clear"` - all existing parameter change MIDI messages are cleared.
     * - `DelayProcessorSnapshot` - clear + the new parameters are set via System Exclusive messages.
     */
    delayParams?: ClearableParameter<DelayProcessorSnapshot>;
    /**
     * The GS Insertion Effect parameters.
     * - `"clear"` - all existing parameter change MIDI messages are cleared.
     * - `InsertionProcessorSnapshot` - clear + the new parameters are set via System Exclusive messages.
     */
    insertionParams?: ClearableParameter<InsertionProcessorSnapshot>;
}

/**
 * Allows easy editing of the file by removing channels, changing programs,
 * changing controllers and transposing channels. Note that this modifies the MIDI in-place.
 * @internal
 */
export function modifyMIDIInternal(midi: BasicMIDI, opts: ModifyMIDIOptions) {
    SpessaLog.groupCollapsed(
        "%cApplying changes to the MIDI file...",
        ConsoleColors.info
    );
    const {
        channels,
        reverbParams,
        chorusParams,
        delayParams,
        insertionParams
    } = opts;

    SpessaLog.info("Desired channel changes", channels);
    SpessaLog.info("Desired reverb parameters", reverbParams);
    SpessaLog.info("Desired chorus parameters", chorusParams);
    SpessaLog.info("Desired delay parameters", delayParams);
    SpessaLog.info("Desired insertion parameters", insertionParams);

    // Optimizations
    const clearDrumParams = opts.drumSetupParams === "clear";
    // Track only channels to clear
    const clearedChannels = new Set<number>();
    // Track only channels to change here
    const channelChanges = new Map<number, ChannelModification>();
    if (channels) {
        for (const [channel, ch] of channels) {
            if (ch === "clear") clearedChannels.add(channel);
            else channelChanges.set(channel, ch);
        }
    }

    // Go through all events one by one
    let system: MIDISystem = "gs";
    let addedGs = false;
    // Track reset position to insert effects right after
    let resetTrack = 0;
    let resetIndex = 0;

    // It copies midiPorts everywhere else, but here 0 works so DO NOT CHANGE!
    /**
     * MIDI port number for the corresponding track
     */
    const midiPorts = midi.tracks.map((t) => t.port);
    /**
     * MIDI port: channel offset
     */
    const midiPortChannelOffsets: Record<number, number> = {};
    let midiPortChannelOffset = 0;

    const assignMIDIPort = (trackNum: number, port: number) => {
        // Do not assign ports to empty tracks

        if (midi.tracks[trackNum].channels.size === 0) return;

        // Assign new 16 channels if the port is not occupied yet
        if (midiPortChannelOffset === 0) {
            midiPortChannelOffset += 16;
            midiPortChannelOffsets[port] = 0;
        }

        if (midiPortChannelOffsets[port] === undefined) {
            midiPortChannelOffsets[port] = midiPortChannelOffset;
            midiPortChannelOffset += 16;
        }

        midiPorts[trackNum] = port;
    };

    // Assign port offsets
    for (const [i, track] of midi.tracks.entries())
        assignMIDIPort(i, track.port);

    // Internal tracking interface
    interface ChannelStatus {
        // Tracks if the channel already had its first note on
        isFirstNoteOn: boolean;
        // RPN/NRPN tracking
        param: ParameterTracker;
        // If the parameters (MSB, LSB and the first data) were cleared.
        // Some MIDIs send param MSB once and then set via LSB only, like:
        // MSB,
        // LSB,
        // Data,
        // LSB,
        // Data,
        // And even though it violates MIDI 1.0, it works...
        clearedParams: {
            // Param LSB
            pLSB: boolean;
            // Param MSB
            pMSB: boolean;
            // Data (any)
            data: boolean;
        };

        // Semitones, for easier access rather than having to do "?? 0"
        keyShift: number;

        // Cents, for easier access rather than having to do "?? 0"
        fineTune: number;
    }

    const channelsAmount = midiPortChannelOffset;
    const channelStatuses: ChannelStatus[] = [];
    for (let i = 0; i < channelsAmount; i++) {
        channelStatuses.push({
            isFirstNoteOn: true,
            param: new ParameterTracker(i),
            clearedParams: {
                pLSB: true,
                pMSB: true,
                data: true
            },
            keyShift: channelChanges.get(i)?.keyShift ?? 0,
            fineTune: channelChanges.get(i)?.fineTune ?? 0
        });
    }

    midi.iterate((e, trackNum, eventIndexes) => {
        const track = midi.tracks[trackNum];
        const index = eventIndexes[trackNum];

        const deleteThisEvent = () => {
            track.deleteEvent(index);
            eventIndexes[trackNum]--;
        };

        const deleteParameter = (channel: number) => {
            const ch = channelStatuses[channel];

            // Delete the parameter selection pair + the data entry that we're currently processing.
            // We don't wait for lsb as it's not required to arrive :-(
            // Why, MIDI, why are you like this?
            // Now I have to handle this complex mess that has to work for either single or double data...
            // And both parameters aren't even required to be sent! Well, they are! But some files don't care.
            // And Sound Canvases don't seem to care either...

            // Testcase: MIDI_Jam & Spoon_Right In The Night.mid, channel 12.
            // That's why we track what we can and can't delete.
            const p = ch.param;
            const msb = p.paramMSB;
            const lsb = p.paramLSB;

            SpessaLog.info(
                `%cClearing Non/Registered Parameter on ${channel}. ` +
                    `Clear MSB: %c${ch.clearedParams.pMSB}%c, ` +
                    `clear LSB: %c${ch.clearedParams.pLSB}%c, ` +
                    `clear data: %c${ch.clearedParams.data}.`,
                ConsoleColors.info,
                ConsoleColors.recognized,
                ConsoleColors.info,
                ConsoleColors.recognized,
                ConsoleColors.info,
                ConsoleColors.recognized
            );

            // Delete the current data entry event first.
            // This is safe because it's the event currently being processed in the loop,
            // Meaning its index is always higher than or equal
            // To the cached MSB/LSB (on a different track).
            if (!ch.clearedParams.data) {
                deleteThisEvent();

                // Shift the events down if they are on the same track (very likely)
                if (trackNum === msb.track && index < msb.event) msb.event--;
                if (trackNum === lsb.track && index < lsb.event) lsb.event--;

                // Flag data as deleted
                ch.clearedParams.data = true;
            }

            if (!ch.clearedParams.pMSB) {
                // Delete data MSB
                midi.tracks[msb.track].deleteEvent(msb.event);
                eventIndexes[msb.track]--;

                // Shift the LSB down if they are on the same track (very likely)
                if (msb.track === lsb.track && msb.event < lsb.event)
                    lsb.event--;

                // Flag MSB as deleted
                ch.clearedParams.pMSB = true;
            }

            if (!ch.clearedParams.pLSB) {
                // Delete data LSB
                midi.tracks[lsb.track].deleteEvent(lsb.event);
                eventIndexes[lsb.track]--;

                // Flag LSB as deleted
                ch.clearedParams.pLSB = true;
            }
        };

        const addEventBefore = (e: MIDIMessage, offset = 0) => {
            track.addEvents(index + offset, e);
            eventIndexes[trackNum]++;
        };

        const portOffset = midiPortChannelOffsets[midiPorts[trackNum]] || 0;
        if (e.statusByte === MIDIMessageTypes.midiPort) {
            assignMIDIPort(trackNum, e.data[0]);
            return;
        }
        // Only process voice + system exclusive messages
        if (
            e.statusByte < MIDIMessageTypes.noteOff ||
            e.statusByte > MIDIMessageTypes.systemExclusive
        )
            return;

        const status = e.statusByte & 0xf0;
        const midiChannel = e.statusByte & 0xf;
        const channel = midiChannel + portOffset;
        // Clear channel?
        if (
            e.statusByte !== MIDIMessageTypes.systemExclusive &&
            clearedChannels.has(channel)
        ) {
            deleteThisEvent();
            return;
        }
        const channelStatus = channelStatuses[channel];
        const channelChange = channelChanges.get(channel);
        switch (status) {
            case MIDIMessageTypes.noteOn: {
                // Make sure that we want to modify this channel at all
                if (!channelChange) break;

                // Is it first?
                if (channelStatus.isFirstNoteOn) {
                    channelStatus.isFirstNoteOn = false;
                    // All right, so this is the first note on for this channel

                    // First: controllers
                    // Because FSMP does not like program changes after cc changes in embedded midis
                    // And since we use splice,
                    // Controllers get added first, then programs before them.
                    // Now add controllers
                    if (channelChange.controllers)
                        for (const [cc, value] of channelChange.controllers) {
                            if (value === "clear") continue;
                            const ccChange = getControllerChange(
                                midiChannel,
                                cc,
                                value,
                                e.ticks
                            );
                            addEventBefore(ccChange);
                        }

                    // Tuning
                    if (channelStatus.fineTune !== 0) {
                        // Add rpn
                        // 64 is the center, 96 = 50 cents up
                        const data =
                            Math.floor(channelStatus.fineTune * 81.92) + 8192;
                        const rpnCoarse = getControllerChange(
                            midiChannel,
                            MIDIControllers.registeredParameterMSB,
                            0,
                            e.ticks
                        );
                        const rpnFine = getControllerChange(
                            midiChannel,
                            MIDIControllers.registeredParameterLSB,
                            1,
                            e.ticks
                        );
                        const dataEntryCoarse = getControllerChange(
                            channel,
                            MIDIControllers.dataEntryMSB,
                            (data >> 7) & 0x7f,
                            e.ticks
                        );
                        const dataEntryFine = getControllerChange(
                            midiChannel,
                            MIDIControllers.dataEntryLSB,
                            data & 0x7f,
                            e.ticks
                        );
                        addEventBefore(dataEntryFine);
                        addEventBefore(dataEntryCoarse);
                        addEventBefore(rpnFine);
                        addEventBefore(rpnCoarse);
                    }

                    // Program change
                    const patch = channelChange.patch;
                    if (patch && patch !== "clear") {
                        SpessaLog.info(
                            `%cSetting %c${channel}%c to %c${MIDIPatchTools.toMIDIString(patch)}%c. Track num: %c${trackNum}`,
                            ConsoleColors.info,
                            ConsoleColors.recognized,
                            ConsoleColors.info,
                            ConsoleColors.recognized,
                            ConsoleColors.info,
                            ConsoleColors.recognized
                        );

                        // Note: this is in reverse.
                        // The output event order is: drums -> lsb -> msb -> program change
                        let desiredBankMSB = patch.bankMSB;
                        let desiredBankLSB = patch.bankLSB;
                        const desiredProgram = patch.program;

                        // Add program change
                        const programChange = new MIDIMessage(
                            e.ticks,
                            (MIDIMessageTypes.programChange |
                                midiChannel) as MIDIMessageType,
                            new IndexedByteArray([desiredProgram])
                        );
                        addEventBefore(programChange);

                        const addBank = (isLSB: boolean, v: number) => {
                            const bankChange = getControllerChange(
                                midiChannel,
                                isLSB
                                    ? MIDIControllers.bankSelectLSB
                                    : MIDIControllers.bankSelect,
                                v,
                                e.ticks
                            );
                            addEventBefore(bankChange);
                        };

                        if (
                            BankSelectHacks.isSystemXG(system) &&
                            patch.isGMGSDrum
                        ) {
                            // Best I can do is XG drums
                            SpessaLog.info(
                                `%cAdding XG Drum change on track %c${trackNum}`,
                                ConsoleColors.recognized,
                                ConsoleColors.value
                            );
                            desiredBankMSB =
                                BankSelectHacks.getDrumBank(system);
                            desiredBankLSB = 0;
                        }

                        // Add bank change
                        addBank(false, desiredBankMSB);
                        addBank(true, desiredBankLSB);

                        if (
                            patch.isGMGSDrum &&
                            !BankSelectHacks.isSystemXG(system) &&
                            midiChannel !== DEFAULT_PERCUSSION
                        ) {
                            // Add gs drum change
                            SpessaLog.info(
                                `%cAdding GS Drum change on track %c${trackNum}`,
                                ConsoleColors.recognized,
                                ConsoleColors.value
                            );
                            addEventBefore(
                                MIDIUtils.gsDrumChange(e.ticks, midiChannel, 1)
                            );
                        }
                    }
                }
                // Transpose key (for zero it won't change anyway)
                e.data[0] += channelStatus.keyShift;
                break;
            }

            case MIDIMessageTypes.noteOff: {
                if (!channelChange) break;
                e.data[0] += channelStatus.keyShift;
                break;
            }

            case MIDIMessageTypes.programChange: {
                // Do we delete it?
                if (channelChange?.patch) {
                    // This channel has program change. BEGONE!
                    deleteThisEvent();
                    return;
                }
                break;
            }

            case MIDIMessageTypes.controllerChange: {
                {
                    const ccNum = e.data[0] as MIDIController;
                    const value = e.data[1];
                    const change = channelChange?.controllers?.get(ccNum);
                    if (change) {
                        // This controller is locked, BEGONE CHANGE!
                        deleteThisEvent();
                        return;
                    }
                    switch (ccNum) {
                        case MIDIControllers.bankSelect:
                        case MIDIControllers.bankSelectLSB: {
                            if (channelChange?.patch) {
                                // BEGONE!
                                deleteThisEvent();
                            }
                            return;
                        }

                        case MIDIControllers.registeredParameterLSB:
                        case MIDIControllers.registeredParameterMSB:
                        case MIDIControllers.nonRegisteredParameterMSB:
                        case MIDIControllers.nonRegisteredParameterLSB: {
                            // Flag the parameter as not cleaned
                            if (
                                ccNum ===
                                    MIDIControllers.nonRegisteredParameterLSB ||
                                ccNum === MIDIControllers.registeredParameterLSB
                            )
                                channelStatus.clearedParams.pLSB = false;
                            else channelStatus.clearedParams.pMSB = false;

                            channelStatus.param.controllerChange(
                                ccNum,
                                value,
                                trackNum,
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
                                trackNum,
                                index
                            );

                            if (!data) return;
                            switch (data.type) {
                                case "Drum Setup": {
                                    if (clearDrumParams) {
                                        // Drum param, BEGONE!
                                        deleteParameter(channel);
                                    }
                                    return;
                                }

                                case "Controller Change": {
                                    // NRPN can change controllers too!
                                    const ccNum = data.controller;
                                    const channel = data.channel;
                                    const change =
                                        channelChange?.controllers?.get(ccNum);
                                    if (change) {
                                        // This controller is locked, BEGONE CHANGE!
                                        deleteParameter(channel);
                                        return;
                                    }
                                    if (
                                        (ccNum === MIDIControllers.bankSelect ||
                                            ccNum ===
                                                MIDIControllers.bankSelectLSB) &&
                                        channelChange?.patch
                                    ) {
                                        // BEGONE!
                                        deleteParameter(channel);
                                    }
                                    break;
                                }

                                case "Channel MIDI Param": {
                                    if (
                                        data.parameter === "keyShift" &&
                                        channelStatus.fineTune
                                    ) {
                                        if (channelStatus.isFirstNoteOn) {
                                            // No note-on yet. Then use it as relative!
                                            const newTune =
                                                channelStatus.fineTune +
                                                data.value;
                                            channelStatus.keyShift +=
                                                Math.trunc(newTune / 100);
                                            channelStatus.fineTune =
                                                newTune % 100;
                                            SpessaLog.info(
                                                `%cFine tuning already present on ${channel}, ` +
                                                    `new relative tune: %c${newTune} cents`,
                                                ConsoleColors.info,
                                                ConsoleColors.recognized
                                            );
                                        }
                                        // We're tuning it ourselves, BEGONE!
                                        deleteParameter(channel);
                                    }
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
                            channelStatus.clearedParams.pLSB = true;
                            channelStatus.clearedParams.pMSB = true;
                            return;
                        }

                        default: {
                            return;
                        }
                    }
                }
            }

            case MIDIMessageTypes.systemExclusive: {
                const syx = MIDIUtils.analyzeSysEx(e.data);
                switch (syx.type) {
                    default: {
                        return;
                    }

                    case "Drum Setup": {
                        // Drum setup
                        if (clearDrumParams) deleteThisEvent();
                        return;
                    }

                    case "Reverb Param": {
                        // Delete all reverb params since we're setting new ones
                        if (reverbParams) deleteThisEvent();

                        return;
                    }

                    case "Chorus Param": {
                        // Delete all chorus params since we're setting new ones
                        if (chorusParams) deleteThisEvent();
                        return;
                    }

                    case "Delay Param": {
                        // Delete all delay params since we're setting new ones
                        if (delayParams) deleteThisEvent();
                        return;
                    }

                    case "Insertion Param": {
                        // Delete all insertion params since we're setting new ones
                        if (insertionParams) deleteThisEvent();
                        return;
                    }

                    case "Program Change": {
                        // SysEx can change programs
                        // Do we delete it?
                        if (
                            channelChanges.get(syx.channel + portOffset)?.patch
                        ) {
                            // This channel has program change. BEGONE!
                            deleteThisEvent();
                        }
                        return;
                    }

                    case "Global MIDI Param": {
                        if (syx.parameter === "system") {
                            switch (syx.value) {
                                case "xg": {
                                    SpessaLog.info(
                                        "%cXG system on detected",
                                        ConsoleColors.info
                                    );

                                    system = "xg";
                                    addedGs = true; // Flag as true so gs won't get added
                                    resetTrack = trackNum;
                                    resetIndex = index;
                                    // Reset NRPN (accuracy + prevent deletion before reset)
                                    for (const ch of channelStatuses) {
                                        ch.param.reset();
                                        ch.clearedParams = {
                                            pLSB: true,
                                            pMSB: true,
                                            data: true
                                        };
                                    }
                                    return;
                                }

                                case "gm2": {
                                    SpessaLog.info(
                                        "%cGM2 system on detected",
                                        ConsoleColors.info
                                    );

                                    system = "gm2";
                                    addedGs = true; // Flag as true so gs won't get added
                                    resetTrack = trackNum;
                                    resetIndex = index;
                                    // Reset NRPN (accuracy + prevent deletion before reset)
                                    for (const ch of channelStatuses) {
                                        ch.param.reset();
                                        ch.clearedParams = {
                                            pLSB: true,
                                            pMSB: true,
                                            data: true
                                        };
                                    }
                                    return;
                                }

                                case "gs": {
                                    // Check for GS on
                                    // That's a GS on, we're done here
                                    SpessaLog.info(
                                        "%cGS on detected!",
                                        ConsoleColors.recognized
                                    );

                                    addedGs = true;
                                    resetTrack = trackNum;
                                    resetIndex = index;
                                    // Reset NRPN (accuracy + prevent deletion before reset)
                                    for (const ch of channelStatuses) {
                                        ch.param.reset();
                                        ch.clearedParams = {
                                            pLSB: true,
                                            pMSB: true,
                                            data: true
                                        };
                                    }
                                    return;
                                }
                                case "gm": {
                                    // Check for GM on
                                    // That's a GM1 system change, remove it!
                                    SpessaLog.info(
                                        "%cGM on detected, removing!",
                                        ConsoleColors.info
                                    );
                                    deleteThisEvent();
                                    addedGs = false;
                                    return;
                                }
                            }
                        }
                        break;
                    }

                    case "Channel MIDI Param": {
                        if (syx.parameter === "fineTune") {
                            const syxChannel = channelChanges.get(
                                syx.channel + portOffset
                            );
                            const syxStatus =
                                channelStatuses[syx.channel + portOffset];
                            if (syxStatus.isFirstNoteOn && syxChannel) {
                                // No note-on yet. Then use it as relative!
                                const newTune = syxStatus.fineTune + syx.value;
                                syxStatus.keyShift += Math.trunc(newTune / 100);
                                syxStatus.fineTune = newTune % 100;
                                SpessaLog.info(
                                    `%cFine tuning already present on ${syx.channel + portOffset}, ` +
                                        `new relative tune: %c${newTune} cents`,
                                    ConsoleColors.info,
                                    ConsoleColors.recognized
                                );
                                deleteThisEvent();
                            }
                            break;
                        }

                        break;
                    }

                    case "Controller Change": {
                        // SysEx can change controllers too!
                        const ccNum = syx.controller;
                        const syxChannel = channelChanges.get(
                            syx.channel + portOffset
                        );
                        const changes = syxChannel?.controllers?.get(ccNum);
                        if (changes !== undefined) {
                            // This controller is locked, BEGONE CHANGE!
                            deleteThisEvent();
                            return;
                        }
                        if (
                            (ccNum === MIDIControllers.bankSelect ||
                                ccNum === MIDIControllers.bankSelectLSB) &&
                            syxChannel?.patch
                        ) {
                            // BEGONE!
                            deleteThisEvent();
                        }
                        return;
                    }
                }
            }
        }
    });

    // Check for GS reset and insert it to ensure that a reset always exists.
    if (
        !addedGs &&
        [...channelChanges.values()].some((c) => c.patch && c.patch !== "clear")
    ) {
        // Gs is not on, add it on the first track at index 0 (or 1 if track name is first)
        let index = 0;
        if (
            midi.tracks[0].events[0].statusByte === MIDIMessageTypes.trackName
        ) {
            index++;
        }
        midi.tracks[0].addEvents(index, MIDIUtils.gsReset(0));
        resetTrack = 0;
        resetIndex = index;
        SpessaLog.info("%cGS on not detected. Adding it.", ConsoleColors.info);
    }

    // Add effects
    const targetTicks = Math.max(0, midi.firstNoteOn);
    // Insert right after reset
    const targetTrack = midi.tracks[resetTrack];
    const targetIndex = resetIndex + 1;

    if (reverbParams && reverbParams !== "clear") {
        const m = reverbAddressMap;
        const p = reverbParams;
        targetTrack.addEvents(
            targetIndex,
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.level, [p.level]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.preLowpass, [
                p.preLowpass
            ]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.character, [
                p.character
            ]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.time, [p.time]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.delayFeedback, [
                p.delayFeedback
            ]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.preDelayTime, [
                p.preDelayTime
            ])
        );
    }
    if (chorusParams && chorusParams !== "clear") {
        const m = chorusAddressMap;
        const p = chorusParams;
        targetTrack.addEvents(
            targetIndex,
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.level, [p.level]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.preLowpass, [
                p.preLowpass
            ]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.feedback, [
                p.feedback
            ]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.delay, [p.delay]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.rate, [p.rate]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.depth, [p.depth]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.sendLevelToReverb, [
                p.sendLevelToReverb
            ]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.sendLevelToDelay, [
                p.sendLevelToDelay
            ])
        );
    }
    if (delayParams && delayParams !== "clear") {
        const m = delayAddressMap;
        const p = delayParams;
        targetTrack.addEvents(
            targetIndex,
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.level, [p.level]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.preLowpass, [
                p.preLowpass
            ]),

            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.timeCenter, [
                p.timeCenter
            ]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.timeRatioLeft, [
                p.timeRatioLeft
            ]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.timeRatioRight, [
                p.timeRatioRight
            ]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.levelCenter, [
                p.levelCenter
            ]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.levelLeft, [
                p.levelLeft
            ]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.levelRight, [
                p.levelRight
            ]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.feedback, [
                p.feedback
            ]),
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x01, m.sendLevelToReverb, [
                p.sendLevelToReverb
            ])
        );
    }

    if (insertionParams && insertionParams !== "clear") {
        const p = insertionParams;

        for (let channel = 0; channel < p.channels.length; channel++) {
            if (p.channels[channel]) {
                targetTrack.addEvents(
                    targetTicks,
                    MIDIUtils.gsMessage(
                        targetTicks,
                        0x40,
                        0x40 | MIDIUtils.channelToSyx(channel),
                        0x22,
                        [1]
                    )
                );
            }
        }

        // Params and sends
        for (let param = 0; param < p.params.length; param++) {
            const value = p.params[param];
            if (value === 255) continue;
            targetTrack.addEvents(
                targetIndex,
                MIDIUtils.gsMessage(targetTicks, 0x40, 0x03, param + 3, [value])
            );
        }

        // Last means that it will be first, so the order is:
        // Type
        // Params and sends
        // Channels
        targetTrack.addEvents(
            targetIndex,
            MIDIUtils.gsMessage(targetTicks, 0x40, 0x03, 0x00, [
                p.type >> 8,
                p.type & 0x7f
            ])
        );
    }
    midi.flush();
    SpessaLog.groupEnd();
}
