import { MIDIMessage } from "../midi_message.js";
import { IndexedByteArray } from "../../utils/indexed_array.js";
import {
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo
} from "../../utils/loggin.js";
import { consoleColors } from "../../utils/other.js";

import { customControllers } from "../../synthetizer/audio_engine/engine_components/controller_tables.js";
import { DEFAULT_PERCUSSION } from "../../synthetizer/audio_engine/synth_constants.js";
import { isGM2On, isGMOn, isGSOn, isXGOn } from "../../utils/sysex_detector.js";
import { isSystemXG, isXGDrums, XG_SFX_VOICE } from "../../utils/xg_hacks.js";
import { messageTypes, midiControllers } from "../enums.ts";
import { getGsOn } from "./get_gs_on.ts";
import type {
    DesiredChannelTranspose,
    DesiredControllerChange,
    DesiredProgramChange
} from "../types.ts";
import type { BasicMIDI } from "../basic_midi.ts";
import type { SynthesizerSnapshot } from "../../synthetizer/audio_engine/snapshot/synthesizer_snapshot.ts";

function getControllerChange(
    channel: number,
    cc: number,
    value: number,
    ticks: number
): MIDIMessage {
    return new MIDIMessage(
        ticks,
        (messageTypes.controllerChange | channel % 16) as messageTypes,
        new IndexedByteArray([cc, value])
    );
}

function getDrumChange(channel: number, ticks: number): MIDIMessage {
    const chanAddress =
        0x10 |
        [1, 2, 3, 4, 5, 6, 7, 8, 0, 9, 10, 11, 12, 13, 14, 15][channel % 16];
    // excluding manufacturerID DeviceID and ModelID (and F7)
    const sysexData = [
        0x41, // Roland
        0x10, // Device ID (defaults to 16 on roland)
        0x42, // GS
        0x12, // Command ID (DT1) (whatever that means...)
        0x40, // System parameter           }
        chanAddress, // Channel parameter   } Address
        0x15, // Drum change                }
        0x01 // Is Drums                    } Data
    ];
    // calculate checksum
    // https://cdn.roland.com/assets/media/pdf/F-20_MIDI_Imple_e01_W.pdf section 4
    const sum = 0x40 + chanAddress + 0x15 + 0x01;
    const checksum = 128 - (sum % 128);
    // add system exclusive to enable drums
    return new MIDIMessage(
        ticks,
        messageTypes.systemExclusive,
        new IndexedByteArray([...sysexData, checksum, 0xf7])
    );
}

/**
 * Allows easy editing of the file by removing channels, changing programs,
 * changing controllers and transposing channels. Note that this modifies the MIDI in-place.
 *
 * @param midi the midi to change
 * @param desiredProgramChanges - The programs to set on given channels.
 * @param desiredControllerChanges - The controllers to set on given channels.
 * @param desiredChannelsToClear - The channels to remove from the sequence.
 * @param desiredChannelsToTranspose - The channels to transpose.
 */
export function modifyMIDIInternal(
    midi: BasicMIDI,
    desiredProgramChanges: DesiredProgramChange[] = [],
    desiredControllerChanges: DesiredControllerChange[] = [],
    desiredChannelsToClear: number[] = [],
    desiredChannelsToTranspose: DesiredChannelTranspose[] = []
) {
    SpessaSynthGroupCollapsed(
        "%cApplying changes to the MIDI file...",
        consoleColors.info
    );

    SpessaSynthInfo("Desired program changes:", desiredProgramChanges);
    SpessaSynthInfo("Desired CC changes:", desiredControllerChanges);
    SpessaSynthInfo("Desired channels to clear:", desiredChannelsToClear);
    SpessaSynthInfo(
        "Desired channels to transpose:",
        desiredChannelsToTranspose
    );

    const channelsToChangeProgram = new Set<number>();
    desiredProgramChanges.forEach((c) => {
        channelsToChangeProgram.add(c.channel);
    });

    // go through all events one by one
    let system = "gs";
    let addedGs = false;
    /**
     * indexes for tracks
     */
    const eventIndexes: number[] = Array(midi.tracks.length).fill(0);
    let remainingTracks = midi.tracks.length;

    function findFirstEventIndex() {
        let index = 0;
        let ticks = Infinity;
        midi.tracks.forEach((track, i) => {
            if (eventIndexes[i] >= track.length) {
                return;
            }
            if (track[eventIndexes[i]].ticks < ticks) {
                index = i;
                ticks = track[eventIndexes[i]].ticks;
            }
        });
        return index;
    }

    // it copies midiPorts everywhere else, but here 0 works so DO NOT CHANGE!
    /**
     * midi port number for the corresponding track
     */
    const midiPorts: number[] = midi.midiPorts.slice();
    /**
     * midi port: channel offset
     */
    const midiPortChannelOffsets: Record<number, number> = {};
    let midiPortChannelOffset = 0;

    const assignMIDIPort = (trackNum: number, port: number) => {
        // do not assign ports to empty tracks
        if (midi.usedChannelsOnTrack[trackNum].size === 0) {
            return;
        }

        // assign new 16 channels if the port is not occupied yet
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

    // assign port offsets
    midi.midiPorts.forEach((port, trackIndex) => {
        assignMIDIPort(trackIndex, port);
    });

    const channelsAmount = midiPortChannelOffset;
    /**
     * Tracks if the channel already had its first note on
     */
    const isFirstNoteOn: boolean[] = Array(channelsAmount).fill(true);

    /**
     * MIDI key transpose
     */
    const coarseTranspose: number[] = Array(channelsAmount).fill(0);
    /**
     * RPN fine transpose
     */
    const fineTranspose: number[] = Array(channelsAmount).fill(0);
    desiredChannelsToTranspose.forEach((transpose) => {
        const coarse = Math.trunc(transpose.keyShift);
        const fine = transpose.keyShift - coarse;
        coarseTranspose[transpose.channel] = coarse;
        fineTranspose[transpose.channel] = fine;
    });

    while (remainingTracks > 0) {
        const trackNum = findFirstEventIndex();
        const track = midi.tracks[trackNum];
        if (eventIndexes[trackNum] >= track.length) {
            remainingTracks--;
            continue;
        }
        const index = eventIndexes[trackNum]++;
        const e = track[index];

        const deleteThisEvent = () => {
            track.splice(index, 1);
            eventIndexes[trackNum]--;
        };

        const addEventBefore = (e: MIDIMessage, offset: number = 0) => {
            track.splice(index + offset, 0, e);
            eventIndexes[trackNum]++;
        };

        const portOffset = midiPortChannelOffsets[midiPorts[trackNum]] || 0;
        if (e.messageStatusByte === messageTypes.midiPort) {
            assignMIDIPort(trackNum, e.messageData[0]);
            continue;
        }
        // don't clear meta
        if (
            e.messageStatusByte <= messageTypes.sequenceSpecific &&
            e.messageStatusByte >= messageTypes.sequenceNumber
        ) {
            continue;
        }
        const status = e.messageStatusByte & 0xf0;
        const midiChannel = e.messageStatusByte & 0xf;
        const channel = midiChannel + portOffset;
        // clear channel?
        if (desiredChannelsToClear.indexOf(channel) !== -1) {
            deleteThisEvent();
            continue;
        }
        switch (status) {
            case messageTypes.noteOn:
                // is it first?
                if (isFirstNoteOn[channel]) {
                    isFirstNoteOn[channel] = false;
                    // all right, so this is the first note on
                    // first: controllers
                    // because FSMP does not like program changes after cc changes in embedded midis
                    // and since we use splice,
                    // controllers get added first, then programs before them
                    // now add controllers
                    desiredControllerChanges
                        .filter((c) => c.channel === channel)
                        .forEach((change) => {
                            const ccChange = getControllerChange(
                                midiChannel,
                                change.controllerNumber,
                                change.controllerValue,
                                e.ticks
                            );
                            addEventBefore(ccChange);
                        });
                    const fineTune = fineTranspose[channel];

                    if (fineTune !== 0) {
                        // add rpn
                        // 64 is the center, 96 = 50 cents up
                        const centsCoarse = fineTune * 64 + 64;
                        const rpnCoarse = getControllerChange(
                            midiChannel,
                            midiControllers.RPNMsb,
                            0,
                            e.ticks
                        );
                        const rpnFine = getControllerChange(
                            midiChannel,
                            midiControllers.RPNLsb,
                            1,
                            e.ticks
                        );
                        const dataEntryCoarse = getControllerChange(
                            channel,
                            midiControllers.dataEntryMsb,
                            centsCoarse,
                            e.ticks
                        );
                        const dataEntryFine = getControllerChange(
                            midiChannel,
                            midiControllers.lsbForControl6DataEntry,
                            0,
                            e.ticks
                        );
                        addEventBefore(dataEntryFine);
                        addEventBefore(dataEntryCoarse);
                        addEventBefore(rpnFine);
                        addEventBefore(rpnCoarse);
                    }

                    if (channelsToChangeProgram.has(channel)) {
                        const change = desiredProgramChanges.find(
                            (c) => c.channel === channel
                        );
                        if (!change) {
                            continue;
                        }
                        const desiredBank = Math.max(
                            0,
                            Math.min(change.bank, 127)
                        );
                        const desiredProgram = change.program;
                        SpessaSynthInfo(
                            `%cSetting %c${change.channel}%c to %c${desiredBank}:${desiredProgram}%c. Track num: %c${trackNum}`,
                            consoleColors.info,
                            consoleColors.recognized,
                            consoleColors.info,
                            consoleColors.recognized,
                            consoleColors.info,
                            consoleColors.recognized
                        );

                        // note: this is in reverse.
                        // the output event order is: drums -> lsb -> msb -> program change

                        // add program change
                        const programChange = new MIDIMessage(
                            e.ticks,
                            (messageTypes.programChange |
                                midiChannel) as messageTypes,
                            new IndexedByteArray([desiredProgram])
                        );
                        addEventBefore(programChange);

                        const addBank = (isLSB: boolean, v: number) => {
                            const bankChange = getControllerChange(
                                midiChannel,
                                isLSB
                                    ? midiControllers.lsbForControl0BankSelect
                                    : midiControllers.bankSelect,
                                v,
                                e.ticks
                            );
                            addEventBefore(bankChange);
                        };

                        // on xg, add lsb
                        if (isSystemXG(system)) {
                            // xg drums: msb can be 120, 126 or 127
                            if (change.isDrum) {
                                SpessaSynthInfo(
                                    `%cAdding XG Drum change on track %c${trackNum}`,
                                    consoleColors.recognized,
                                    consoleColors.value
                                );
                                addBank(
                                    false,
                                    isXGDrums(desiredBank) ? desiredBank : 127
                                );
                                addBank(true, 0);
                            } else {
                                // sfx voice is set via MSB
                                if (desiredBank === XG_SFX_VOICE) {
                                    addBank(false, XG_SFX_VOICE);
                                    addBank(true, 0);
                                } else {
                                    // add variation as LSB
                                    addBank(false, 0);
                                    addBank(true, desiredBank);
                                }
                            }
                        } else {
                            // add just msb
                            addBank(false, desiredBank);

                            if (
                                change.isDrum &&
                                midiChannel !== DEFAULT_PERCUSSION
                            ) {
                                // add gs drum change
                                SpessaSynthInfo(
                                    `%cAdding GS Drum change on track %c${trackNum}`,
                                    consoleColors.recognized,
                                    consoleColors.value
                                );
                                addEventBefore(
                                    getDrumChange(midiChannel, e.ticks)
                                );
                            }
                        }
                    }
                }
                // transpose key (for zero it won't change anyway)
                e.messageData[0] += coarseTranspose[channel];
                break;

            case messageTypes.noteOff:
                e.messageData[0] += coarseTranspose[channel];
                break;

            case messageTypes.programChange:
                // do we delete it?
                if (channelsToChangeProgram.has(channel)) {
                    // this channel has program change. BEGONE!
                    deleteThisEvent();
                    continue;
                }
                break;

            case messageTypes.controllerChange:
                {
                    const ccNum = e.messageData[0];
                    const changes = desiredControllerChanges.find(
                        (c) =>
                            c.channel === channel &&
                            ccNum === c.controllerNumber
                    );
                    if (changes !== undefined) {
                        // this controller is locked, BEGONE CHANGE!
                        deleteThisEvent();
                        continue;
                    }
                    // bank maybe?
                    if (
                        ccNum === midiControllers.bankSelect ||
                        ccNum === midiControllers.lsbForControl0BankSelect
                    ) {
                        if (channelsToChangeProgram.has(channel)) {
                            // BEGONE!
                            deleteThisEvent();
                        }
                    }
                }
                break;

            case messageTypes.systemExclusive:
                // check for xg on
                if (isXGOn(e)) {
                    SpessaSynthInfo(
                        "%cXG system on detected",
                        consoleColors.info
                    );
                    system = "xg";
                    addedGs = true; // flag as true so gs won't get added
                } else if (
                    e.messageData[0] === 0x43 && // yamaha
                    e.messageData[2] === 0x4c && // XG
                    e.messageData[3] === 0x08 && // part parameter
                    e.messageData[5] === 0x03 // program change
                ) {
                    // check for xg program change
                    // do we delete it?
                    if (
                        channelsToChangeProgram.has(
                            e.messageData[4] + portOffset
                        )
                    ) {
                        // this channel has program change. BEGONE!
                        deleteThisEvent();
                    }
                } else if (isGSOn(e)) {
                    // check for GS on
                    // that's a GS on, we're done here
                    addedGs = true;
                    SpessaSynthInfo(
                        "%cGS on detected!",
                        consoleColors.recognized
                    );
                    break;
                } else if (isGMOn(e) || isGM2On(e)) {
                    // check for GM/2 on
                    // that's a GM1 system change, remove it!
                    SpessaSynthInfo(
                        "%cGM/2 on detected, removing!",
                        consoleColors.info
                    );
                    deleteThisEvent();
                    addedGs = false;
                }
        }
    }
    // check for gs
    if (!addedGs && desiredProgramChanges.length > 0) {
        // gs is not on, add it on the first track at index 0 (or 1 if track name is first)
        let index = 0;
        if (midi.tracks[0][0].messageStatusByte === messageTypes.trackName) {
            index++;
        }
        midi.tracks[0].splice(index, 0, getGsOn(0));
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
    snapshot.channelSnapshots.forEach((channel, channelNumber) => {
        if (channel.isMuted) {
            channelsToClear.push(channelNumber);
            return;
        }
        const transposeFloat =
            channel.channelTransposeKeyShift +
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
                program: channel.program,
                bank: channel.bank,
                isDrum: channel.drumChannel
            });
        }
        // check for locked controllers and change them appropriately
        channel.lockedControllers.forEach((l, ccNumber) => {
            if (
                !l ||
                ccNumber > 127 ||
                ccNumber === midiControllers.bankSelect
            ) {
                return;
            }
            const targetValue = channel.midiControllers[ccNumber] >> 7; // channel controllers are stored as 14 bit values
            controllerChanges.push({
                channel: channelNumber,
                controllerNumber: ccNumber,
                controllerValue: targetValue
            });
        });
    });
    midi.modifyMIDI(
        programChanges,
        controllerChanges,
        channelsToClear,
        channelsToTranspose
    );
}
