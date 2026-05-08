import { MIDIMessage } from "../midi_message";
import { IndexedByteArray } from "../../utils/indexed_array";
import { SpessaSynthLog } from "../../utils/loggin";
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
import { SysEx } from "../../utils/sysex";
import { CONTROLLER_TABLE_SIZE } from "../../synthesizer/audio_engine/channel/controller_tables";
import type { MIDISystem } from "../../soundbank/types";

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
 * Represents a desired program change for a MIDI channel.
 */
interface ChannelProgram extends MIDIPatch {
    /**
     * The channel number.
     */
    channel: number;
}

/**
 * Represents a desired controller change for a MIDI channel.
 */
interface ChannelController {
    /**
     * The channel number.
     */
    channel: number;

    /**
     * The MIDI controller number.
     */
    controller: MIDIController;

    /**
     * The new controller value.
     */
    value: number;
}

/**
 * Represents a desired channel transpose change.
 */
interface ChannelPitchOffset {
    /**
     * The channel number.
     */
    channel: number;

    /**
     * Pitch offset of the channel.
     * This can use floating point numbers,
     * which will be used to fine-tune the pitch in cents using RPN messages.
     * For example a value of 1.5 shifts the key numbers up by 1 and tunes them up by 50 cents.
     */
    pitchOffset: number;
}

export interface ModifyMIDIOptions {
    /**
     * The programs to set on given channels.
     * This removes all program changes from this channel
     * and inserts one with the selected preset at the beginning.
     */
    programChanges: ChannelProgram[];
    /**
     * The controllers to set on given channels.
     * This removes all program changes from this channel
     * and inserts one with the selected preset at the beginning.
     */
    controllerChanges: ChannelController[];
    /**
     * The channels to remove from the sequence.
     * This deletes all messages that belong to this channel.
     */
    clearedChannels: Set<number>;
    /**
     * The channels to change the pitch of.
     * This shifts the key numbers and allows microtonal tuning in cents.
     */
    pitchOffsets: ChannelPitchOffset[];
    /**
     * If the drum editing parameters should be cleared.
     */
    clearDrumParams: boolean;
    /**
     * The desired GS reverb parameters, leave undefined for no change.
     * If set, all reverb parameters are cleared and the new ones are set via a System Exclusive message.
     */
    reverbParams?: ReverbProcessorSnapshot;
    /**
     * The GS chorus parameters, leave undefined for no change.
     * If set, all chorus parameters are cleared and the new ones are set via a System Exclusive message.
     */
    chorusParams?: ChorusProcessorSnapshot;
    /**
     * The GS delay parameters, leave undefined for no change.
     * If set, all delay parameters are cleared and the new ones are set via a System Exclusive message.
     */
    delayParams?: DelayProcessorSnapshot;
    /**
     * The GS Insertion Effect parameters, leave undefined for no change.
     * If set, all Insertion Effect parameters are cleared and the new ones are set via a System Exclusive message.
     */
    insertionParams?: InsertionProcessorSnapshot;
}

/**
 * Allows easy editing of the file by removing channels, changing programs,
 * changing controllers and transposing channels. Note that this modifies the MIDI in-place.
 * @internal
 */
export function modifyMIDIInternal(
    midi: BasicMIDI,
    {
        programChanges,
        controllerChanges,
        clearedChannels,
        pitchOffsets,
        clearDrumParams = false,
        reverbParams,
        chorusParams,
        delayParams,
        insertionParams
    }: ModifyMIDIOptions
) {
    SpessaSynthLog.groupCollapsed(
        "%cApplying changes to the MIDI file...",
        ConsoleColors.info
    );

    SpessaSynthLog.info("Desired program changes:", programChanges);
    SpessaSynthLog.info("Desired CC changes:", controllerChanges);
    SpessaSynthLog.info("Desired channels to clear:", clearedChannels);
    SpessaSynthLog.info("Desired channels to transpose:", pitchOffsets);
    SpessaSynthLog.info("Desired reverb parameters", reverbParams);
    SpessaSynthLog.info("Desired chorus parameters", chorusParams);
    SpessaSynthLog.info("Desired delay parameters", delayParams);
    SpessaSynthLog.info("Desired insertion parameters", insertionParams);

    const channelsToChangeProgram = new Set<number>();
    for (const c of programChanges) {
        channelsToChangeProgram.add(c.channel);
    }

    // Go through all events one by one
    let system: MIDISystem = "gs";
    let addedGs = false;

    // It copies midiPorts everywhere else, but here 0 works so DO NOT CHANGE!
    /**
     * Midi port number for the corresponding track
     */
    const midiPorts = midi.tracks.map((t) => t.port);
    /**
     * Midi port: channel offset
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

    const channelsAmount = midiPortChannelOffset;
    // Tracks if the channel already had its first note on
    const isFirstNoteOn = new Array<boolean>(channelsAmount).fill(true);
    // MIDI key shift
    const coarseTranspose = new Array<number>(channelsAmount).fill(0);
    // RPN fine-tuning
    const fineTranspose = new Array<number>(channelsAmount).fill(0);
    for (const transpose of pitchOffsets) {
        const coarse = Math.trunc(transpose.pitchOffset);
        const fine = transpose.pitchOffset - coarse;
        coarseTranspose[transpose.channel] = coarse;
        fineTranspose[transpose.channel] = fine;
    }

    // NRPN tracking (index)
    let lastNrpnMsb = -1;
    let lastNrpnMsbTrack = 0;
    let lastNrpnLsb = -1;
    let lastNrpnLsbTrack = 0;
    let isNrpnMode = false;

    midi.iterate((e, trackNum, eventIndexes) => {
        const track = midi.tracks[trackNum];
        const index = eventIndexes[trackNum];

        const deleteThisEvent = () => {
            track.deleteEvent(index);
            eventIndexes[trackNum]--;
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
        switch (status) {
            case MIDIMessageTypes.noteOn: {
                // Is it first?
                if (isFirstNoteOn[channel]) {
                    isFirstNoteOn[channel] = false;
                    // All right, so this is the first note on
                    // First: controllers
                    // Because FSMP does not like program changes after cc changes in embedded midis
                    // And since we use splice,
                    // Controllers get added first, then programs before them
                    // Now add controllers
                    for (const change of controllerChanges.filter(
                        (c) => c.channel === channel
                    )) {
                        const ccChange = getControllerChange(
                            midiChannel,
                            change.controller,
                            change.value,
                            e.ticks
                        );
                        addEventBefore(ccChange);
                    }
                    const fineTune = fineTranspose[channel];

                    if (fineTune !== 0) {
                        // Add rpn
                        // 64 is the center, 96 = 50 cents up
                        const centsCoarse = fineTune * 64 + 64;
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
                            centsCoarse,
                            e.ticks
                        );
                        const dataEntryFine = getControllerChange(
                            midiChannel,
                            MIDIControllers.dataEntryLSB,
                            0,
                            e.ticks
                        );
                        addEventBefore(dataEntryFine);
                        addEventBefore(dataEntryCoarse);
                        addEventBefore(rpnFine);
                        addEventBefore(rpnCoarse);
                    }

                    if (channelsToChangeProgram.has(channel)) {
                        const change = programChanges.find(
                            (c) => c.channel === channel
                        );
                        if (!change) {
                            return;
                        }
                        SpessaSynthLog.info(
                            `%cSetting %c${change.channel}%c to %c${MIDIPatchTools.toMIDIString(change)}%c. Track num: %c${trackNum}`,
                            ConsoleColors.info,
                            ConsoleColors.recognized,
                            ConsoleColors.info,
                            ConsoleColors.recognized,
                            ConsoleColors.info,
                            ConsoleColors.recognized
                        );

                        // Note: this is in reverse.
                        // The output event order is: drums -> lsb -> msb -> program change
                        let desiredBankMSB = change.bankMSB;
                        let desiredBankLSB = change.bankLSB;
                        const desiredProgram = change.program;

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
                            change.isGMGSDrum
                        ) {
                            // Best I can do is XG drums
                            SpessaSynthLog.info(
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
                            change.isGMGSDrum &&
                            !BankSelectHacks.isSystemXG(system) &&
                            midiChannel !== DEFAULT_PERCUSSION
                        ) {
                            // Add gs drum change
                            SpessaSynthLog.info(
                                `%cAdding GS Drum change on track %c${trackNum}`,
                                ConsoleColors.recognized,
                                ConsoleColors.value
                            );
                            addEventBefore(
                                SysEx.gsDrumChange(midiChannel, e.ticks)
                            );
                        }
                    }
                }
                // Transpose key (for zero it won't change anyway)
                e.data[0] += coarseTranspose[channel];
                break;
            }

            case MIDIMessageTypes.noteOff: {
                e.data[0] += coarseTranspose[channel];
                break;
            }

            case MIDIMessageTypes.programChange: {
                // Do we delete it?
                if (channelsToChangeProgram.has(channel)) {
                    // This channel has program change. BEGONE!
                    deleteThisEvent();
                    return;
                }
                break;
            }

            case MIDIMessageTypes.controllerChange: {
                {
                    const ccNum = e.data[0] as MIDIController;
                    const changes = controllerChanges.find(
                        (c) => c.channel === channel && ccNum === c.controller
                    );
                    if (changes !== undefined) {
                        // This controller is locked, BEGONE CHANGE!
                        deleteThisEvent();
                        return;
                    }
                    switch (ccNum) {
                        case MIDIControllers.bankSelect:
                        case MIDIControllers.bankSelectLSB: {
                            if (channelsToChangeProgram.has(channel)) {
                                // BEGONE!
                                deleteThisEvent();
                            }
                            return;
                        }

                        case MIDIControllers.registeredParameterLSB:
                        case MIDIControllers.registeredParameterMSB: {
                            isNrpnMode = false;
                            return;
                        }

                        case MIDIControllers.nonRegisteredParameterMSB: {
                            lastNrpnMsb = eventIndexes[trackNum];
                            lastNrpnMsbTrack = trackNum;
                            isNrpnMode = true;
                            return;
                        }

                        case MIDIControllers.nonRegisteredParameterLSB: {
                            lastNrpnLsb = eventIndexes[trackNum];
                            lastNrpnLsbTrack = trackNum;
                            isNrpnMode = true;
                            return;
                        }

                        // NRPN we care about only uses MSB
                        case MIDIControllers.dataEntryMSB: {
                            if (
                                lastNrpnLsb &&
                                lastNrpnMsb &&
                                isNrpnMode &&
                                clearDrumParams
                            ) {
                                const msb =
                                    midi.tracks[lastNrpnMsbTrack].events[
                                        lastNrpnMsb
                                    ].data[1];
                                // LSB is drum number here
                                if (msb >= 0x18 && msb <= 0x1f) {
                                    // Drum param, BEGONE!
                                    deleteThisEvent();

                                    // NRPN, BEGONE!
                                    const lsbTrack =
                                        midi.tracks[lastNrpnLsbTrack];
                                    const msbTrack =
                                        midi.tracks[lastNrpnMsbTrack];
                                    lsbTrack.deleteEvent(lastNrpnLsb);
                                    eventIndexes[lastNrpnLsbTrack]--;
                                    msbTrack.deleteEvent(lastNrpnMsb);
                                    eventIndexes[lastNrpnMsbTrack]--;
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
                const syx = SysEx.analyze(e.data);
                switch (syx.type) {
                    default: {
                        return;
                    }

                    case "XG Reset": {
                        SpessaSynthLog.info(
                            "%cXG system on detected",
                            ConsoleColors.info
                        );
                        system = "xg";
                        addedGs = true; // Flag as true so gs won't get added
                        return;
                    }

                    case "GM2 On": {
                        SpessaSynthLog.info(
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
                        SpessaSynthLog.info(
                            "%cGS on detected!",
                            ConsoleColors.recognized
                        );
                        return;
                    }

                    case "GM Off":
                    case "GM On": {
                        // Check for GM on
                        // That's a GM1 system change, remove it!
                        SpessaSynthLog.info(
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
                            channelsToChangeProgram.has(
                                syx.channel + portOffset
                            )
                        ) {
                            // This channel has program change. BEGONE!
                            deleteThisEvent();
                        }
                        return;
                    }

                    case "Controller Change": {
                        // SysEx can change controllers too!
                        const ccNum = syx.controller;
                        const channel = syx.channel;
                        const changes = controllerChanges.find(
                            (c) =>
                                c.channel === channel && ccNum === c.controller
                        );
                        if (changes !== undefined) {
                            // This controller is locked, BEGONE CHANGE!
                            deleteThisEvent();
                            return;
                        }
                        if (
                            (ccNum === MIDIControllers.bankSelect ||
                                ccNum === MIDIControllers.bankSelectLSB) &&
                            channelsToChangeProgram.has(channel)
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
    if (reverbParams) {
        const m = reverbAddressMap;
        const p = reverbParams;
        targetTrack.addEvents(
            targetIndex,
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.level, [p.level]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.preLowpass, [
                p.preLowpass
            ]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.character, [
                p.character
            ]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.time, [p.time]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.delayFeedback, [
                p.delayFeedback
            ]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.preDelayTime, [
                p.preDelayTime
            ])
        );
    }
    if (chorusParams) {
        const m = chorusAddressMap;
        const p = chorusParams;
        targetTrack.addEvents(
            targetIndex,
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.level, [p.level]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.preLowpass, [
                p.preLowpass
            ]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.feedback, [p.feedback]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.delay, [p.delay]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.rate, [p.rate]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.depth, [p.depth]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.sendLevelToReverb, [
                p.sendLevelToReverb
            ]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.sendLevelToDelay, [
                p.sendLevelToDelay
            ])
        );
    }
    if (delayParams) {
        const m = delayAddressMap;
        const p = delayParams;
        targetTrack.addEvents(
            targetIndex,
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.level, [p.level]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.preLowpass, [
                p.preLowpass
            ]),

            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.timeCenter, [
                p.timeCenter
            ]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.timeRatioLeft, [
                p.timeRatioLeft
            ]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.timeRatioRight, [
                p.timeRatioRight
            ]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.levelCenter, [
                p.levelCenter
            ]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.levelLeft, [
                p.levelLeft
            ]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.levelRight, [
                p.levelRight
            ]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.feedback, [p.feedback]),
            SysEx.gsMessage(targetTicks, 0x40, 0x01, m.sendLevelToReverb, [
                p.sendLevelToReverb
            ])
        );
    }

    if (insertionParams) {
        const p = insertionParams;

        for (let channel = 0; channel < p.channels.length; channel++) {
            if (p.channels[channel]) {
                targetTrack.addEvents(
                    targetTicks,
                    SysEx.gsMessage(
                        targetTicks,
                        0x40,
                        0x40 | SysEx.channelToSyx(channel),
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
                SysEx.gsMessage(targetTicks, 0x40, 0x03, param + 3, [value])
            );
        }

        // Last means that it will be first, so the order is:
        // Type
        // Params and sends
        // Channels
        targetTrack.addEvents(
            targetIndex,
            SysEx.gsMessage(targetTicks, 0x40, 0x03, 0x00, [
                p.type >> 8,
                p.type & 0x7f
            ])
        );
    }

    // Check for gs
    if (!addedGs && programChanges.length > 0) {
        // Gs is not on, add it on the first track at index 0 (or 1 if track name is first)
        let index = 0;
        if (
            midi.tracks[0].events[0].statusByte === MIDIMessageTypes.trackName
        ) {
            index++;
        }
        midi.tracks[0].addEvents(index, SysEx.gsReset(0));
        SpessaSynthLog.info(
            "%cGS on not detected. Adding it.",
            ConsoleColors.info
        );
    }
    midi.flush();
    SpessaSynthLog.groupEnd();
}

/**
 * Modifies the sequence according to the locked presets and controllers in the given snapshot
 */
export function applySnapshotInternal(
    midi: BasicMIDI,
    snapshot: SynthesizerSnapshot
) {
    const pitchOffsets: ChannelPitchOffset[] = [];

    const channelsToClear = new Set<number>();
    const programChanges: ChannelProgram[] = [];
    const controllerChanges: ChannelController[] = [];
    const globalTranspose = snapshot.masterParameters.pitchOffset;
    for (
        let channelNumber = 0;
        channelNumber < snapshot.midiChannels.length;
        channelNumber++
    ) {
        const channel = snapshot.midiChannels[channelNumber];
        if (channel.masterParameters.isMuted) {
            channelsToClear.add(channelNumber);
            continue;
        }
        const transposeFloat =
            channel.masterParameters.pitchOffset +
            (channel.drumChannel ? 0 : globalTranspose);
        if (transposeFloat !== 0) {
            pitchOffsets.push({
                channel: channelNumber,
                pitchOffset: transposeFloat
            });
        }
        if (channel.masterParameters.presetLock && channel.patch) {
            programChanges.push({
                channel: channelNumber,
                ...channel.patch
            });
        }

        for (let ccNumber = 0; ccNumber < CONTROLLER_TABLE_SIZE; ccNumber++) {
            if (
                !channel.lockedControllers[ccNumber] ||
                ccNumber === MIDIControllers.bankSelect
            ) {
                continue;
            }
            const targetValue = channel.midiControllers[ccNumber] >> 7; // Channel controllers are stored as 14 bit values
            controllerChanges.push({
                channel: channelNumber,
                controller: ccNumber as MIDIController,
                value: targetValue
            });
        }
    }
    midi.modify({
        programChanges,
        controllerChanges,
        clearedChannels: channelsToClear,
        pitchOffsets: pitchOffsets,
        clearDrumParams: snapshot.masterParameters.drumLock,
        reverbParams: snapshot.masterParameters.reverbLock
            ? snapshot.reverbProcessor
            : undefined,
        chorusParams: snapshot.masterParameters.chorusLock
            ? snapshot.chorusProcessor
            : undefined,
        delayParams: snapshot.masterParameters.delayLock
            ? snapshot.delayProcessor
            : undefined,
        insertionParams: snapshot.masterParameters.insertionEffectLock
            ? snapshot.insertionProcessor
            : undefined
    });
}
