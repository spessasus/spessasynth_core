import { MIDIMessage } from "../midi_message";
import { IndexedByteArray } from "../../utils/indexed_array";
import {
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo
} from "../../utils/loggin";
import { consoleColors } from "../../utils/other";

import { DEFAULT_PERCUSSION } from "../../synthesizer/audio_engine/engine_components/synth_constants";
import {
    channelToSyx,
    isDrumEdit,
    isGM2On,
    isGMOn,
    isGSChorus,
    isGSDelay,
    isGSInsertion,
    isGSOn,
    isGSReverb,
    isProgramChange,
    isXGOn
} from "../../utils/sysex_detector";
import { BankSelectHacks } from "../../utils/midi_hacks";
import {
    type MIDIController,
    midiControllers,
    type MIDIMessageType,
    midiMessageTypes
} from "../enums";
import { getGsOn } from "./get_gs_on";
import type {
    DesiredChannelTranspose,
    DesiredControllerChange,
    DesiredProgramChange
} from "../types";
import type { BasicMIDI } from "../basic_midi";
import type { SynthesizerSnapshot } from "../../synthesizer/audio_engine/snapshot/synthesizer_snapshot";
import type { SynthSystem } from "../../synthesizer/types";
import { customControllers } from "../../synthesizer/enums";
import { MIDIPatchTools } from "../../soundbank/basic_soundbank/midi_patch";
import type {
    ChorusProcessorSnapshot,
    DelayProcessorSnapshot,
    InsertionProcessorSnapshot,
    ReverbProcessorSnapshot
} from "../../synthesizer/audio_engine/effects/types";

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
        (midiMessageTypes.controllerChange | (channel % 16)) as MIDIMessageType,
        new IndexedByteArray([cc, value])
    );
}

function sendAddress(
    ticks: number,
    a1: number,
    a2: number,
    a3: number,
    data: number[]
) {
    // Calculate checksum
    // https://cdn.roland.com/assets/media/pdf/F-20_MIDI_Imple_e01_W.pdf section 4
    const sum = a1 + a2 + a3 + data.reduce((sum, cur) => sum + cur, 0);
    const checksum = (128 - (sum % 128)) & 0x7f;
    return new MIDIMessage(
        ticks,
        midiMessageTypes.systemExclusive,
        new Uint8Array([
            0x41, // Roland
            0x10, // Device ID (defaults to 16 on roland)
            0x42, // GS
            0x12, // Command ID (DT1)
            a1,
            a2,
            a3,
            ...data,
            checksum,
            0xf7 // End of exclusive
        ])
    );
}

function getDrumChange(channel: number, ticks: number): MIDIMessage {
    const chanAddress = 0x10 | channelToSyx(channel);
    return sendAddress(ticks, 40, chanAddress, 0x15, [0x01]);
}

export interface ModifyMIDIOptions {
    programChanges: DesiredProgramChange[];
    controllerChanges: DesiredControllerChange[];
    channelsToClear: number[];
    channelsToTranspose: DesiredChannelTranspose[];
    clearDrumParams: boolean;
    reverbParams?: ReverbProcessorSnapshot;
    chorusParams?: ChorusProcessorSnapshot;
    delayParams?: DelayProcessorSnapshot;
    insertionParams?: InsertionProcessorSnapshot;
}

/**
 * Allows easy editing of the file by removing channels, changing programs,
 * changing controllers and transposing channels. Note that this modifies the MIDI in-place.
 *
 * @param midi the midi to change
 * @param programChanges - The programs to set on given channels.
 * @param controllerChanges - The controllers to set on given channels.
 * @param channelsToClear - The channels to remove from the sequence.
 * @param channelTransposes - The channels to transpose.
 * @param clearDrumParams - If the drum editing parameters should be cleared.
 * @param reverbParams - The desired GS reverb params, leave undefined for no change.
 * @param chorusParams - The desired GS chorus params, leave undefined for no change.
 * @param delayParams - The desired GS delay params, leave undefined for no change.
 * @param insertionParams - The insertion effect params, leave undefined for no change.
 */
export function modifyMIDIInternal(
    midi: BasicMIDI,
    {
        programChanges = [],
        controllerChanges = [],
        channelsToClear = [],
        channelsToTranspose = [],
        clearDrumParams = false,
        reverbParams,
        chorusParams,
        delayParams,
        insertionParams
    }: ModifyMIDIOptions
) {
    SpessaSynthGroupCollapsed(
        "%cApplying changes to the MIDI file...",
        consoleColors.info
    );

    SpessaSynthInfo("Desired program changes:", programChanges);
    SpessaSynthInfo("Desired CC changes:", controllerChanges);
    SpessaSynthInfo("Desired channels to clear:", channelsToClear);
    SpessaSynthInfo("Desired channels to transpose:", channelsToTranspose);
    SpessaSynthInfo("Desired reverb parameters", reverbParams);
    SpessaSynthInfo("Desired chorus parameters", chorusParams);
    SpessaSynthInfo("Desired delay parameters", delayParams);
    SpessaSynthInfo("Desired insertion parameters", insertionParams);

    const channelsToChangeProgram = new Set<number>();
    for (const c of programChanges) {
        channelsToChangeProgram.add(c.channel);
    }

    // Go through all events one by one
    let system: SynthSystem = "gs";
    let addedGs = false;

    // It copies midiPorts everywhere else, but here 0 works so DO NOT CHANGE!
    /**
     * Midi port number for the corresponding track
     */
    const midiPorts: number[] = midi.tracks.map((t) => t.port);
    /**
     * Midi port: channel offset
     */
    const midiPortChannelOffsets: Record<number, number> = {};
    let midiPortChannelOffset = 0;

    const assignMIDIPort = (trackNum: number, port: number) => {
        // Do not assign ports to empty tracks

        if (midi.tracks[trackNum].channels.size === 0) {
            return;
        }

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
    for (const [i, track] of midi.tracks.entries()) {
        assignMIDIPort(i, track.port);
    }

    const channelsAmount = midiPortChannelOffset;
    /**
     * Tracks if the channel already had its first note on
     */
    const isFirstNoteOn = new Array<boolean>(channelsAmount).fill(true);

    /**
     * MIDI key transpose
     */
    const coarseTranspose = new Array<number>(channelsAmount).fill(0);
    /**
     * RPN fine transpose
     */
    const fineTranspose = new Array<number>(channelsAmount).fill(0);
    for (const transpose of channelsToTranspose) {
        const coarse = Math.trunc(transpose.keyShift);
        const fine = transpose.keyShift - coarse;
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
        if (e.statusByte === midiMessageTypes.midiPort) {
            assignMIDIPort(trackNum, e.data[0]);
            return;
        }
        // Don't clear meta
        if (
            e.statusByte <= midiMessageTypes.sequenceSpecific &&
            e.statusByte >= midiMessageTypes.sequenceNumber
        ) {
            return;
        }
        const status = e.statusByte & 0xf0;
        const midiChannel = e.statusByte & 0xf;
        const channel = midiChannel + portOffset;
        // Clear channel?
        if (
            e.statusByte !== midiMessageTypes.systemExclusive &&
            channelsToClear.includes(channel)
        ) {
            deleteThisEvent();
            return;
        }
        switch (status) {
            case midiMessageTypes.noteOn: {
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
                            change.controllerNumber,
                            change.controllerValue,
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
                            midiControllers.registeredParameterMSB,
                            0,
                            e.ticks
                        );
                        const rpnFine = getControllerChange(
                            midiChannel,
                            midiControllers.registeredParameterLSB,
                            1,
                            e.ticks
                        );
                        const dataEntryCoarse = getControllerChange(
                            channel,
                            midiControllers.dataEntryMSB,
                            centsCoarse,
                            e.ticks
                        );
                        const dataEntryFine = getControllerChange(
                            midiChannel,
                            midiControllers.dataEntryLSB,
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
                        SpessaSynthInfo(
                            `%cSetting %c${change.channel}%c to %c${MIDIPatchTools.toMIDIString(change)}%c. Track num: %c${trackNum}`,
                            consoleColors.info,
                            consoleColors.recognized,
                            consoleColors.info,
                            consoleColors.recognized,
                            consoleColors.info,
                            consoleColors.recognized
                        );

                        // Note: this is in reverse.
                        // The output event order is: drums -> lsb -> msb -> program change
                        let desiredBankMSB = change.bankMSB;
                        let desiredBankLSB = change.bankLSB;
                        const desiredProgram = change.program;

                        // Add program change
                        const programChange = new MIDIMessage(
                            e.ticks,
                            (midiMessageTypes.programChange |
                                midiChannel) as MIDIMessageType,
                            new IndexedByteArray([desiredProgram])
                        );
                        addEventBefore(programChange);

                        const addBank = (isLSB: boolean, v: number) => {
                            const bankChange = getControllerChange(
                                midiChannel,
                                isLSB
                                    ? midiControllers.bankSelectLSB
                                    : midiControllers.bankSelect,
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
                            SpessaSynthInfo(
                                `%cAdding XG Drum change on track %c${trackNum}`,
                                consoleColors.recognized,
                                consoleColors.value
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
                            SpessaSynthInfo(
                                `%cAdding GS Drum change on track %c${trackNum}`,
                                consoleColors.recognized,
                                consoleColors.value
                            );
                            addEventBefore(getDrumChange(midiChannel, e.ticks));
                        }
                    }
                }
                // Transpose key (for zero it won't change anyway)
                e.data[0] += coarseTranspose[channel];
                break;
            }

            case midiMessageTypes.noteOff: {
                e.data[0] += coarseTranspose[channel];
                break;
            }

            case midiMessageTypes.programChange: {
                // Do we delete it?
                if (channelsToChangeProgram.has(channel)) {
                    // This channel has program change. BEGONE!
                    deleteThisEvent();
                    return;
                }
                break;
            }

            case midiMessageTypes.controllerChange: {
                {
                    const ccNum = e.data[0] as MIDIController;
                    const changes = controllerChanges.find(
                        (c) =>
                            c.channel === channel &&
                            ccNum === c.controllerNumber
                    );
                    if (changes !== undefined) {
                        // This controller is locked, BEGONE CHANGE!
                        deleteThisEvent();
                        return;
                    }
                    switch (ccNum) {
                        case midiControllers.bankSelect:
                        case midiControllers.bankSelectLSB: {
                            if (channelsToChangeProgram.has(channel)) {
                                // BEGONE!
                                deleteThisEvent();
                            }
                            return;
                        }

                        case midiControllers.registeredParameterLSB:
                        case midiControllers.registeredParameterMSB: {
                            isNrpnMode = false;
                            return;
                        }

                        case midiControllers.nonRegisteredParameterMSB: {
                            lastNrpnMsb = eventIndexes[trackNum];
                            lastNrpnMsbTrack = trackNum;
                            isNrpnMode = true;
                            return;
                        }

                        case midiControllers.nonRegisteredParameterLSB: {
                            lastNrpnLsb = eventIndexes[trackNum];
                            lastNrpnLsbTrack = trackNum;
                            isNrpnMode = true;
                            return;
                        }

                        // NRPN we care about only uses MSB
                        case midiControllers.dataEntryMSB: {
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

            case midiMessageTypes.systemExclusive: {
                // Check for xg on
                if (isXGOn(e)) {
                    SpessaSynthInfo(
                        "%cXG system on detected",
                        consoleColors.info
                    );
                    system = "xg";
                    addedGs = true; // Flag as true so gs won't get added

                    return;
                }
                if (isGM2On(e)) {
                    SpessaSynthInfo(
                        "%cGM2 system on detected",
                        consoleColors.info
                    );
                    system = "gm2";
                    addedGs = true; // Flag as true so gs won't get added
                    return;
                }
                if (isGSOn(e)) {
                    // Check for GS on
                    // That's a GS on, we're done here
                    addedGs = true;
                    SpessaSynthInfo(
                        "%cGS on detected!",
                        consoleColors.recognized
                    );
                    return;
                }
                if (isGMOn(e)) {
                    // Check for GM on
                    // That's a GM1 system change, remove it!
                    SpessaSynthInfo(
                        "%cGM on detected, removing!",
                        consoleColors.info
                    );
                    deleteThisEvent();
                    addedGs = false;
                    return;
                }
                // Drum setup
                if (clearDrumParams && isDrumEdit(e.data)) {
                    deleteThisEvent();
                    return;
                }

                // GS effects
                if (reverbParams && isGSReverb(e.data)) {
                    // Delete all reverb params since we're setting new ones
                    deleteThisEvent();
                    return;
                }

                if (chorusParams && isGSChorus(e.data)) {
                    // Delete all chorus params since we're setting new ones
                    deleteThisEvent();
                    return;
                }

                if (delayParams && isGSDelay(e.data)) {
                    // Delete all delay params since we're setting new ones
                    deleteThisEvent();
                    return;
                }

                if (insertionParams && isGSInsertion(e.data)) {
                    // Delete all insertion params since we're setting new ones
                    deleteThisEvent();
                    return;
                }

                // SysEx can change programs
                const prog = isProgramChange(e.data);
                if (prog !== -1) {
                    // Do we delete it?
                    if (channelsToChangeProgram.has(prog + portOffset)) {
                        // This channel has program change. BEGONE!
                        deleteThisEvent();
                    }
                    return;
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
            sendAddress(targetTicks, 0x40, 0x01, m.level, [p.level]),
            sendAddress(targetTicks, 0x40, 0x01, m.preLowpass, [p.preLowpass]),
            sendAddress(targetTicks, 0x40, 0x01, m.character, [p.character]),
            sendAddress(targetTicks, 0x40, 0x01, m.time, [p.time]),
            sendAddress(targetTicks, 0x40, 0x01, m.delayFeedback, [
                p.delayFeedback
            ]),
            sendAddress(targetTicks, 0x40, 0x01, m.preDelayTime, [
                p.preDelayTime
            ])
        );
    }
    if (chorusParams) {
        const m = chorusAddressMap;
        const p = chorusParams;
        targetTrack.addEvents(
            targetIndex,
            sendAddress(targetTicks, 0x40, 0x01, m.level, [p.level]),
            sendAddress(targetTicks, 0x40, 0x01, m.preLowpass, [p.preLowpass]),
            sendAddress(targetTicks, 0x40, 0x01, m.feedback, [p.feedback]),
            sendAddress(targetTicks, 0x40, 0x01, m.delay, [p.delay]),
            sendAddress(targetTicks, 0x40, 0x01, m.rate, [p.rate]),
            sendAddress(targetTicks, 0x40, 0x01, m.depth, [p.depth]),
            sendAddress(targetTicks, 0x40, 0x01, m.sendLevelToReverb, [
                p.sendLevelToReverb
            ]),
            sendAddress(targetTicks, 0x40, 0x01, m.sendLevelToDelay, [
                p.sendLevelToDelay
            ])
        );
    }
    if (delayParams) {
        const m = delayAddressMap;
        const p = delayParams;
        targetTrack.addEvents(
            targetIndex,
            sendAddress(targetTicks, 0x40, 0x01, m.level, [p.level]),
            sendAddress(targetTicks, 0x40, 0x01, m.preLowpass, [p.preLowpass]),

            sendAddress(targetTicks, 0x40, 0x01, m.timeCenter, [p.timeCenter]),
            sendAddress(targetTicks, 0x40, 0x01, m.timeRatioLeft, [
                p.timeRatioLeft
            ]),
            sendAddress(targetTicks, 0x40, 0x01, m.timeRatioRight, [
                p.timeRatioRight
            ]),
            sendAddress(targetTicks, 0x40, 0x01, m.levelCenter, [
                p.levelCenter
            ]),
            sendAddress(targetTicks, 0x40, 0x01, m.levelLeft, [p.levelLeft]),
            sendAddress(targetTicks, 0x40, 0x01, m.levelRight, [p.levelRight]),
            sendAddress(targetTicks, 0x40, 0x01, m.feedback, [p.feedback]),
            sendAddress(targetTicks, 0x40, 0x01, m.sendLevelToReverb, [
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
                    sendAddress(
                        targetTicks,
                        0x40,
                        0x40 | channelToSyx(channel),
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
                sendAddress(targetTicks, 0x40, 0x03, param + 3, [value])
            );
        }

        // Last means that it will be first, so the order is:
        // Type
        // Params and sends
        // Channels
        targetTrack.addEvents(
            targetIndex,
            sendAddress(targetTicks, 0x40, 0x03, 0x00, [
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
            midi.tracks[0].events[0].statusByte === midiMessageTypes.trackName
        ) {
            index++;
        }
        midi.tracks[0].addEvents(index, getGsOn(0));
        SpessaSynthInfo("%cGS on not detected. Adding it.", consoleColors.info);
    }
    midi.flush();
    SpessaSynthGroupEnd();
}

/**
 * Modifies the sequence according to the locked presets and controllers in the given snapshot
 */
export function applySnapshotInternal(
    midi: BasicMIDI,
    snapshot: SynthesizerSnapshot
) {
    const channelsToTranspose: DesiredChannelTranspose[] = [];

    const channelsToClear: number[] = [];
    const programChanges: DesiredProgramChange[] = [];
    const controllerChanges: DesiredControllerChange[] = [];
    for (const [
        channelNumber,
        channel
    ] of snapshot.channelSnapshots.entries()) {
        if (channel.isMuted) {
            channelsToClear.push(channelNumber);
            continue;
        }
        const transposeFloat =
            channel.keyShift +
            channel.customControllers[customControllers.channelTransposeFine] /
                100;
        if (transposeFloat !== 0) {
            channelsToTranspose.push({
                channel: channelNumber,
                keyShift: transposeFloat
            });
        }
        if (channel.lockPreset) {
            programChanges.push({
                channel: channelNumber,
                ...channel.patch
            });
        }
        // Check for locked controllers and change them appropriately
        for (const [ccNumber, l] of channel.lockedControllers.entries()) {
            if (
                !l ||
                ccNumber > 127 ||
                ccNumber === midiControllers.bankSelect
            ) {
                continue;
            }
            const targetValue = channel.midiControllers[ccNumber] >> 7; // Channel controllers are stored as 14 bit values
            controllerChanges.push({
                channel: channelNumber,
                controllerNumber: ccNumber,
                controllerValue: targetValue
            });
        }
    }
    midi.modify({
        programChanges,
        controllerChanges,
        channelsToClear,
        channelsToTranspose: channelsToTranspose,
        clearDrumParams: snapshot.masterParameters.drumLock,
        reverbParams: snapshot.masterParameters.reverbLock
            ? snapshot.reverbSnapshot
            : undefined,
        chorusParams: snapshot.masterParameters.chorusLock
            ? snapshot.chorusSnapshot
            : undefined,
        delayParams: snapshot.masterParameters.delayLock
            ? snapshot.delaySnapshot
            : undefined,
        insertionParams: snapshot.masterParameters.insertionEffectLock
            ? snapshot.insertionSnapshot
            : undefined
    });
}
