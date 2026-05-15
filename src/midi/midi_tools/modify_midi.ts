import { MIDIMessage } from "../midi_message";
import { IndexedByteArray } from "../../utils/indexed_array";
import { SpessaLog } from "../../utils/loggin";
import { ConsoleColors } from "../../utils/other";

import {
    CONTROLLER_TABLE_SIZE,
    DEFAULT_PERCUSSION
} from "../../synthesizer/audio_engine/synth_constants";

import { BankSelectHacks } from "../../utils/midi_hacks";
import {
    type MIDIController,
    MIDIControllers,
    type MIDIMessageType,
    MIDIMessageTypes
} from "../enums";
import type { BasicMIDI } from "../basic_midi";
import type { SynthesizerSnapshot } from "../../synthesizer/audio_engine/synthesizer_snapshot";
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
type ClearableParameter<T> = T | "clear";

interface ChannelModification {
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
     * - `MIDIPatch` - clear + sets the new patch according to the MIDI system at the start of the song.
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
     * - `"clear"` - all existing parameter change MIDI messages are removed.
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
        // Then we see the second data and only clean it.
        clearedParams: boolean;
    }

    const channelsAmount = midiPortChannelOffset;
    const channelStatuses: ChannelStatus[] = [];
    for (let i = 0; i < channelsAmount; i++) {
        channelStatuses.push({
            isFirstNoteOn: true,
            param: new ParameterTracker(i),
            clearedParams: false
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
            if (ch.clearedParams) {
                // Just this (probably data LSB)
                // But it could also be MSB...
                // Why isn't RPN just a single message?
                // Broadcast System Exclusives were made just for this.
                deleteThisEvent();
                ch.clearedParams = false;
            } else {
                // Delete param + data
                // We don't wait for lsb as it's not required to arrive :-(
                // Why, MIDI, why are you like this?
                // Now I have to handle this complex mess that has to work for either single or double data...
                // At least both params are guaranteed be sent.
                deleteThisEvent();

                const p = ch.param;
                midi.tracks[p.paramMSB.track].deleteEvent(p.paramMSB.event);
                eventIndexes[p.paramMSB.track]--;
                midi.tracks[p.paramLSB.track].deleteEvent(p.paramLSB.event);
                eventIndexes[p.paramLSB.track]--;
                ch.clearedParams = true;
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
        // Don't clear meta
        if (
            e.statusByte <= MIDIMessageTypes.sequenceSpecific &&
            e.statusByte >= MIDIMessageTypes.sequenceNumber
        ) {
            return;
        }
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
                    const fineTune = channelChange.fineTune ?? 0;
                    if (fineTune !== 0) {
                        // Add rpn
                        // 64 is the center, 96 = 50 cents up
                        const data = Math.floor(fineTune * 81.92) + 8192;
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
                            data >> 7,
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
                e.data[0] += channelChange.keyShift ?? 0;
                break;
            }

            case MIDIMessageTypes.noteOff: {
                if (!channelChange) break;
                e.data[0] += channelChange?.keyShift ?? 0;
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
                            channelStatus.clearedParams = false;
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

                                case "Fine Tune": {
                                    if (channelChange?.fineTune) {
                                        if (channelStatus.isFirstNoteOn) {
                                            // No note-on yet. Then use it as relative!
                                            const newTune =
                                                channelChange.fineTune +
                                                data.value / 100;
                                            channelChange.keyShift =
                                                (channelChange.keyShift ?? 0) +
                                                Math.trunc(newTune);
                                            channelChange.fineTune =
                                                newTune - Math.trunc(newTune);
                                            SpessaLog.info(
                                                `%cRelative fine tuning, offset: %c${data.value}`,
                                                ConsoleColors.info,
                                                ConsoleColors.recognized
                                            );
                                        }
                                        // We're tuning it ourselves, BEGONE!
                                        deleteParameter(channel);
                                    }
                                    return;
                                }
                            }
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

                    case "XG Reset": {
                        SpessaLog.info(
                            "%cXG system on detected",
                            ConsoleColors.info
                        );
                        system = "xg";
                        addedGs = true; // Flag as true so gs won't get added
                        return;
                    }

                    case "GM2 On": {
                        SpessaLog.info(
                            "%cGM2 system on detected",
                            ConsoleColors.info
                        );
                        system = "gm2";
                        addedGs = true; // Flag as true so gs won't get added
                        return;
                    }

                    case "GS Reset": {
                        // Check for GS on
                        // That's a GS on, we're done here
                        addedGs = true;
                        SpessaLog.info(
                            "%cGS on detected!",
                            ConsoleColors.recognized
                        );
                        return;
                    }

                    case "GM Off":
                    case "GM On": {
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

                    case "Fine Tune": {
                        const syxChannel = channelChanges.get(
                            syx.channel + portOffset
                        );
                        if (channelStatus.isFirstNoteOn && syxChannel) {
                            // No note-on yet. Then use it as relative!
                            const newTune =
                                (syxChannel?.fineTune ?? 0) + syx.value / 100;
                            syxChannel.keyShift =
                                (syxChannel.keyShift ?? 0) +
                                Math.trunc(newTune);
                            syxChannel.fineTune = newTune - Math.trunc(newTune);
                            SpessaLog.info(
                                `%cRelative fine tuning, offset: %c${syx.value}`,
                                ConsoleColors.info,
                                ConsoleColors.recognized
                            );
                            deleteThisEvent();
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

    // Add effects
    const targetTicks = Math.max(0, midi.firstNoteOn - 10);
    const targetTrack = midi.tracks[0];
    const targetIndex = Math.max(
        0,
        targetTrack.events.findIndex((m) => m.ticks >= targetTicks) - 1
    );
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

    // Check for gs
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
        SpessaLog.info("%cGS on not detected. Adding it.", ConsoleColors.info);
    }
    midi.flush();
    SpessaLog.groupEnd();
}

/**
 * Modifies the sequence according to the locked presets and controllers in the given snapshot.
 * Note that this ignores the MIDI parameters and only applies system parameter tuning.
 */
export function applySnapshotInternal(
    midi: BasicMIDI,
    snapshot: SynthesizerSnapshot
) {
    const channels = new Map<number, ClearableParameter<ChannelModification>>();
    const globalKeyShift = snapshot.systemParameters.keyShift;
    const globalFineTune = snapshot.systemParameters.fineTune;
    for (
        let channelNumber = 0;
        channelNumber < snapshot.midiChannels.length;
        channelNumber++
    ) {
        const channelSnapshot = snapshot.midiChannels[channelNumber];
        if (channelSnapshot.systemParameters.isMuted) {
            channels.set(channelNumber, "clear");
            continue;
        }
        const keyShift =
            channelSnapshot.systemParameters.keyShift +
            (channelSnapshot.drumChannel ? 0 : globalKeyShift);
        const fineTune =
            channelSnapshot.systemParameters.fineTune +
            (channelSnapshot.drumChannel ? 0 : globalFineTune);
        let patch: MIDIPatch | undefined;
        if (
            channelSnapshot.systemParameters.presetLock &&
            channelSnapshot.patch
        ) {
            patch = { ...channelSnapshot.patch };
        }

        const controllers = new Map<MIDIController, number>();
        for (let ccNumber = 0; ccNumber < CONTROLLER_TABLE_SIZE; ccNumber++) {
            if (
                !channelSnapshot.lockedControllers[ccNumber] ||
                ccNumber === MIDIControllers.bankSelect
            ) {
                continue;
            }
            const targetValue = channelSnapshot.midiControllers[ccNumber] >> 7; // Channel controllers are stored as 14 bit values
            controllers.set(ccNumber as MIDIController, targetValue);
        }

        channels.set(channelNumber, {
            keyShift,
            fineTune,
            patch,
            controllers
        });
    }
    midi.modify({
        channels,
        drumSetupParams: snapshot.systemParameters.drumLock
            ? "clear"
            : undefined,
        reverbParams: snapshot.systemParameters.reverbLock
            ? snapshot.reverbProcessor
            : undefined,
        chorusParams: snapshot.systemParameters.chorusLock
            ? snapshot.chorusProcessor
            : undefined,
        delayParams: snapshot.systemParameters.delayLock
            ? snapshot.delayProcessor
            : undefined,
        insertionParams: snapshot.systemParameters.insertionEffectLock
            ? snapshot.insertionProcessor
            : undefined
    });
}
