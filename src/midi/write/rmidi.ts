import { IndexedByteArray } from "../../utils/indexed_array";
import { RIFFChunk } from "../../utils/riff_chunk";
import { getStringBytes } from "../../utils/byte_functions/string";
import { MIDIMessage } from "../midi_message";
import { ConsoleColors } from "../../utils/other";
import { writeLittleEndianIndexed } from "../../utils/byte_functions/little_endian";
import { DEFAULT_PERCUSSION } from "../../synthesizer/audio_engine/synth_constants";
import { BankSelectHacks } from "../../utils/midi_hacks";
import {
    MIDIControllers,
    type MIDIMessageType,
    MIDIMessageTypes
} from "../enums";
import type { BasicSoundBank } from "../../soundbank/basic_soundbank/basic_soundbank";
import type { RMIDInfoData, RMIDInfoFourCC, RMIDIWriteOptions } from "../types";
import type { BasicMIDI } from "../basic_midi";
import {
    type MIDIPatch,
    MIDIPatchTools
} from "../../soundbank/basic_soundbank/midi_patch";
import { MIDIUtils } from "../midi_tools/midi_utils";
import { SpessaLog } from "../../utils/loggin";
import type { MIDISystem } from "../../soundbank/types";

const DEFAULT_COPYRIGHT = "Created using SpessaSynth";

interface ChannelStatus {
    program: number;
    isDrum: boolean;
    lastBank?: MIDIMessage;
    lastBankLSB?: MIDIMessage;
    hasBankSelect: boolean;
}

/**
 * Add the offset to the bank.
 * See https://github.com/spessasus/sf2-rmidi-specification#readme
 * Also fix presets that don't exist
 * Since midi player6 doesn't seem to default to 0 when non-existent...
 */
function correctBankOffsetInternal(
    mid: BasicMIDI,
    bankOffset: number,
    soundBank: BasicSoundBank
) {
    // Start with GM, that way we add GS if there's either GS on or no reset
    // Cast is necessary here as TSC thinks we don't change it ever
    let system = "gm" as MIDISystem;
    /**
     * The unwanted system messages such as gm on
     */
    const unwantedSystems: { tNum: number; e: MIDIMessage }[] = [];

    // It copies midiPorts everywhere else, but here 0 works so DO NOT CHANGE!
    const ports = new Array<number>(mid.tracks.length).fill(0);
    const channelsAmount = 16 + Math.max(...mid.portChannelOffsetMap);
    const channels: ChannelStatus[] = [];
    for (let i = 0; i < channelsAmount; i++) {
        channels.push({
            program: 0,
            isDrum: i % 16 === DEFAULT_PERCUSSION, // Drums appear on 9 every 16 channels,
            lastBank: undefined,
            lastBankLSB: undefined,
            hasBankSelect: false
        });
    }

    mid.iterate((e, trackNum, eventIndexes) => {
        const portOffset = mid.portChannelOffsetMap[ports[trackNum]];
        if (e.statusByte === MIDIMessageTypes.midiPort) {
            ports[trackNum] = e.data[0];
            return;
        }
        const status = e.statusByte & 0xf0;
        if (
            status !== MIDIMessageTypes.controllerChange &&
            status !== MIDIMessageTypes.programChange &&
            status !== MIDIMessageTypes.systemExclusive
        )
            return;

        if (status === MIDIMessageTypes.systemExclusive) {
            const syx = MIDIUtils.analyzeSysEx(e.data);
            switch (syx.type) {
                default: {
                    return;
                }

                // Check for drum sysex
                case "Drums On": {
                    const sysexChannel = syx.channel + portOffset;
                    channels[sysexChannel].isDrum = syx.isDrum;
                    return;
                }

                case "Global MIDI Param": {
                    if (syx.parameter === "system") {
                        system = syx.value;
                        if (syx.value === "gm") {
                            // We do not want gm1
                            unwantedSystems.push({
                                tNum: trackNum,
                                e: e
                            });
                        }
                    }
                    break;
                }

                case "Controller Change": {
                    // Replace the system exclusive with a regular controller change
                    const t = mid.tracks[trackNum];
                    const newEvent = new MIDIMessage(
                        e.ticks,
                        (MIDIMessageTypes.controllerChange |
                            syx.channel) as MIDIMessageType,
                        new Uint8Array([syx.controller, syx.value])
                    );
                    t.events[eventIndexes[trackNum]] = newEvent;
                    e = newEvent;
                    SpessaLog.info(
                        "%cReplaced a system exclusive with controller change!",
                        ConsoleColors.info
                    );

                    break; // Do not return, keep parsing
                }

                case "Program Change": {
                    // Replace the system exclusive with a regular program
                    const t = mid.tracks[trackNum];
                    const newEvent = new MIDIMessage(
                        e.ticks,
                        (MIDIMessageTypes.programChange |
                            syx.channel) as MIDIMessageType,
                        new Uint8Array([syx.value])
                    );
                    t.events[eventIndexes[trackNum]] = newEvent;
                    e = newEvent;
                    SpessaLog.info(
                        "%cReplaced a system exclusive with program change!",
                        ConsoleColors.info
                    );

                    break; // Do not return, keep parsing
                }
            }
        }

        // Program change
        const chNum = (e.statusByte & 0xf) + portOffset;
        const ch = channels[chNum];
        if (status === MIDIMessageTypes.programChange) {
            const sentProgram = e.data[0];
            const patch: MIDIPatch = {
                program: sentProgram,
                bankLSB: ch.lastBankLSB?.data?.[1] ?? 0,
                // Make sure to take bank offset into account
                bankMSB: BankSelectHacks.subtractBankOffset(
                    ch.lastBank?.data?.[1] ?? 0,
                    mid.bankOffset,
                    system === "xg"
                ),
                isGMGSDrum: ch.isDrum
            };
            const targetPreset = soundBank.getPreset(patch, system);
            SpessaLog.info(
                `%cInput patch: %c${MIDIPatchTools.toMIDIString(patch)}%c. Channel %c${chNum}%c. Changing patch to ${targetPreset.toString()}.`,
                ConsoleColors.info,
                ConsoleColors.unrecognized,
                ConsoleColors.info,
                ConsoleColors.recognized,
                ConsoleColors.info
            );
            // Set the program number
            e.data[0] = targetPreset.program;

            if (targetPreset.isGMGSDrum && BankSelectHacks.isSystemXG(system))
                // GM/GS drums returned, leave as is
                // (drums are already set since we got GMGS, just the sound bank doesn't have any XG.)
                return;

            if (ch.lastBank === undefined) return;

            ch.lastBank.data[1] = BankSelectHacks.addBankOffset(
                targetPreset.bankMSB,
                bankOffset,
                system === "xg"
            );
            if (ch.lastBankLSB === undefined) return;

            ch.lastBankLSB.data[1] = targetPreset.bankLSB;
            return;
        }

        // Controller change
        // We only care about bank-selects
        const isLSB = e.data[0] === MIDIControllers.bankSelectLSB;
        if (e.data[0] !== MIDIControllers.bankSelect && !isLSB) return;

        // Bank select
        ch.hasBankSelect = true;
        // Interpret
        if (isLSB) ch.lastBankLSB = e;
        else ch.lastBank = e;
    });

    // Add missing bank selects
    // Add all bank selects that are missing for this track
    for (let chNum = 0; chNum < channels.length; chNum++) {
        const ch = channels[chNum];
        if (ch.hasBankSelect) continue;

        // Find the first program change (for the given channel)
        const midiChannel = chNum % 16;
        const status = MIDIMessageTypes.programChange | midiChannel;
        // Find track with this channel being used
        const portOffset = Math.floor(chNum / 16) * 16;
        const port = mid.portChannelOffsetMap.indexOf(portOffset);
        const track = mid.tracks.find(
            (t) => t.port === port && t.channels.has(midiChannel)
        );
        if (track === undefined)
            // This channel is not used at all
            continue;

        let indexToAdd = track.events.findIndex((e) => e.statusByte === status);
        if (indexToAdd === -1) {
            // No program change...
            // Add programs if they are missing from the track
            // (need them to activate bank 1 for the embedded soundfont)
            const programIndex = track.events.findIndex(
                (e) =>
                    e.statusByte > 0x80 &&
                    e.statusByte < 0xf0 &&
                    (e.statusByte & 0xf) === midiChannel
            );
            if (programIndex === -1)
                // No voices??? skip
                continue;

            const programTicks = track.events[programIndex].ticks;
            const targetProgram = soundBank.getPreset(
                {
                    bankMSB: 0,
                    bankLSB: 0,
                    program: 0,
                    isGMGSDrum: false
                },
                system
            ).program;
            track.addEvents(
                programIndex,
                new MIDIMessage(
                    programTicks,
                    (MIDIMessageTypes.programChange |
                        midiChannel) as MIDIMessageType,
                    new IndexedByteArray([targetProgram])
                )
            );
            indexToAdd = programIndex;
        }
        SpessaLog.info(
            `%cAdding bank select for %c${chNum}`,
            ConsoleColors.info,
            ConsoleColors.recognized
        );
        const ticks = track.events[indexToAdd].ticks;
        const targetPreset = soundBank.getPreset(
            {
                bankLSB: 0,
                bankMSB: 0,
                program: ch.program,
                isGMGSDrum: ch.isDrum
            },
            system
        );
        const targetBank = BankSelectHacks.addBankOffset(
            targetPreset.bankMSB,
            bankOffset,
            system === "xg"
        );
        track.addEvents(
            indexToAdd,
            new MIDIMessage(
                ticks,
                (MIDIMessageTypes.controllerChange |
                    midiChannel) as MIDIMessageType,
                new IndexedByteArray([MIDIControllers.bankSelect, targetBank])
            )
        );
    }

    // Make sure to put gs if gm
    if (system === "gm" && !BankSelectHacks.isSystemXG(system)) {
        for (const m of unwantedSystems) {
            const track = mid.tracks[m.tNum];
            track.deleteEvent(track.events.indexOf(m.e));
        }
        let index = 0;
        // First event is track name for detection, don't break that
        if (mid.tracks[0].events[0].statusByte === MIDIMessageTypes.trackName)
            index++;

        mid.tracks[0].addEvents(index, MIDIUtils.gsReset(0));
    }
    mid.flush();
}

export const DEFAULT_RMIDI_WRITE_OPTIONS: RMIDIWriteOptions = {
    bankOffset: 0,
    metadata: {},
    correctBankOffset: true,
    soundBank: undefined
};

/**
 * Writes an RMIDI file. Note that this method modifies the MIDI file in-place.
 * @param mid MIDI to modify.
 * @param soundBankBinary The binary sound bank to embed into the file.
 * @param options Extra options for writing the file.
 * @returns the binary data
 */
export function writeRMIDIInternal(
    mid: BasicMIDI,
    soundBankBinary: ArrayBuffer,
    options: RMIDIWriteOptions
): ArrayBuffer {
    const metadata = options.metadata;
    SpessaLog.group("%cWriting the RMIDI File...", ConsoleColors.info);
    SpessaLog.info("metadata", metadata);
    SpessaLog.info("Initial bank offset", mid.bankOffset);
    if (options.correctBankOffset) {
        if (!options.soundBank) {
            throw new Error(
                "Sound bank must be provided if correcting bank offset."
            );
        }
        correctBankOffsetInternal(mid, options.bankOffset, options.soundBank);
    }
    const newMid = new IndexedByteArray(mid.writeMIDI());

    // Apply metadata
    metadata.name ??= mid.getName();
    metadata.creationDate ??= new Date();
    metadata.copyright ??= DEFAULT_COPYRIGHT;
    metadata.software ??= "SpessaSynth";

    // No idea how to turn this into a for...of
    // eslint-disable-next-line unicorn/no-array-for-each
    Object.entries(metadata).forEach(
        <K extends keyof RMIDInfoData>(v: unknown[]) => {
            const val = v as [K, RMIDInfoData[K]];
            if (val[1]) {
                mid.setRMIDInfo(val[0], val[1]);
            }
        }
    );

    // Info data for RMID
    const infoContent: Uint8Array[] = [];
    const writeInfo = (type: RMIDInfoFourCC, data: Uint8Array) => {
        infoContent.push(RIFFChunk.write(type, data));
    };

    for (const v of Object.entries(mid.rmidiInfo)) {
        const type = v[0] as keyof RMIDInfoData;
        const data = v[1];

        switch (type) {
            case "album": {
                // Note that there are two album chunks: IPRD and IALB
                // Spessasynth uses IPRD, but writes both
                writeInfo("IALB", data);
                writeInfo("IPRD", data);
                break;
            }

            case "software": {
                writeInfo("ISFT", data);
                break;
            }

            case "infoEncoding": {
                writeInfo("IENC", data);
                break;
            }

            case "creationDate": {
                writeInfo("ICRD", data);
                break;
            }

            case "picture": {
                writeInfo("IPIC", data);
                break;
            }

            case "name": {
                writeInfo("INAM", data);
                break;
            }

            case "artist": {
                writeInfo("IART", data);
                break;
            }

            case "genre": {
                writeInfo("IGNR", data);
                break;
            }

            case "copyright": {
                writeInfo("ICOP", data);
                break;
            }

            case "comment": {
                writeInfo("ICMT", data);
                break;
            }

            case "engineer": {
                writeInfo("IENG", data);
                break;
            }

            case "subject": {
                writeInfo("ISBJ", data);
                break;
            }

            case "midiEncoding": {
                writeInfo("MENC", data);
                break;
            }
        }
    }

    // Bank offset
    const DBNK = new IndexedByteArray(2);
    writeLittleEndianIndexed(DBNK, options.bankOffset, 2);
    infoContent.push(RIFFChunk.write("DBNK", DBNK));

    // Combine and write out
    SpessaLog.info("%cFinished!", ConsoleColors.info);
    SpessaLog.groupEnd();
    return RIFFChunk.writeParts("RIFF", [
        getStringBytes("RMID"),
        RIFFChunk.write("data", newMid),
        RIFFChunk.writeParts("INFO", infoContent, true),
        new IndexedByteArray(soundBankBinary)
    ]).buffer;
}
