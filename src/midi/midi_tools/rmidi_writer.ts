import { IndexedByteArray } from "../../utils/indexed_array";
import { writeRIFFChunkParts, writeRIFFChunkRaw } from "../../utils/riff_chunk";
import { getStringBytes } from "../../utils/byte_functions/string";
import { MIDIMessage } from "../midi_message";
import { SpessaSynthGroup, SpessaSynthGroupEnd, SpessaSynthInfo } from "../../utils/loggin";
import { consoleColors } from "../../utils/other";
import { writeLittleEndianIndexed } from "../../utils/byte_functions/little_endian";
import { DEFAULT_PERCUSSION } from "../../synthesizer/audio_engine/engine_components/synth_constants";
import { isSystemXG } from "../../utils/xg_hacks";
import { isGM2On, isGMOn, isGSDrumsOn, isGSOn, isXGOn } from "../../utils/sysex_detector";
import { midiControllers, type MIDIMessageType, midiMessageTypes } from "../enums";
import type { BasicSoundBank } from "../../soundbank/basic_soundbank/basic_soundbank";
import type { RMIDInfoData, RMIDInfoFourCC, RMIDIWriteOptions } from "../types";
import type { BasicMIDI } from "../basic_midi";
import { getGsOn } from "./get_gs_on";
import type { SynthSystem } from "../../synthesizer/types";
import { type MIDIPatch, toMIDIString } from "../../soundbank/basic_soundbank/midi_patch";

const DEFAULT_COPYRIGHT = "Created using SpessaSynth";

function correctBankOffsetInternal(
    mid: BasicMIDI,
    bankOffset: number,
    soundBank: BasicSoundBank
) {
    // Add the offset to the bank.
    // See https://github.com/spessasus/sf2-rmidi-specification#readme
    // Also fix presets that don't exist
    // Since midi player6 doesn't seem to default to 0 when non-existent...
    let system: SynthSystem = "gm";
    /**
     * The unwanted system messages such as gm/gm2 on
     */
    const unwantedSystems: { tNum: number; e: MIDIMessage }[] = [];
    /**
     * Indexes for tracks
     */
    const eventIndexes: number[] = Array<number>(mid.tracks.length).fill(0);
    let remainingTracks = mid.tracks.length;

    const findFirstEventIndex = () => {
        let index = 0;
        let ticks = Infinity;
        mid.tracks.forEach((track, i) => {
            if (eventIndexes[i] >= track.events.length) {
                return;
            }
            if (track.events[eventIndexes[i]].ticks < ticks) {
                index = i;
                ticks = track.events[eventIndexes[i]].ticks;
            }
        });
        return index;
    };

    // It copies midiPorts everywhere else, but here 0 works so DO NOT CHANGE!
    const ports = Array<number>(mid.tracks.length).fill(0);
    const channelsAmount = 16 + Math.max(...mid.portChannelOffsetMap);
    const channelsInfo: {
        program: number;
        drums: boolean;
        lastBank?: MIDIMessage;
        lastBankLSB?: MIDIMessage;
        hasBankSelect: boolean;
    }[] = [];
    for (let i = 0; i < channelsAmount; i++) {
        channelsInfo.push({
            program: 0,
            drums: i % 16 === DEFAULT_PERCUSSION, // Drums appear on 9 every 16 channels,
            lastBank: undefined,
            lastBankLSB: undefined,
            hasBankSelect: false
        });
    }
    while (remainingTracks > 0) {
        const trackNum = findFirstEventIndex();
        const track = mid.tracks[trackNum];
        if (eventIndexes[trackNum] >= track.events.length) {
            remainingTracks--;
            continue;
        }
        const e = track.events[eventIndexes[trackNum]];
        eventIndexes[trackNum]++;

        const portOffset = mid.portChannelOffsetMap[ports[trackNum]];
        if (e.statusByte === midiMessageTypes.midiPort) {
            ports[trackNum] = e.data[0];
            continue;
        }
        const status = e.statusByte & 0xf0;
        if (
            status !== midiMessageTypes.controllerChange &&
            status !== midiMessageTypes.programChange &&
            status !== midiMessageTypes.systemExclusive
        ) {
            continue;
        }

        if (status === midiMessageTypes.systemExclusive) {
            // Check for drum sysex
            if (!isGSDrumsOn(e)) {
                // Check for XG
                if (isXGOn(e)) {
                    system = "xg";
                } else if (isGSOn(e)) {
                    system = "gs";
                } else if (isGMOn(e)) {
                    // We do not want gm1
                    system = "gm";
                    unwantedSystems.push({
                        tNum: trackNum,
                        e: e
                    });
                } else if (isGM2On(e)) {
                    system = "gm2";
                }
                continue;
            }
            const sysexChannel =
                [9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15][
                    e.data[5] & 0x0f
                ] + portOffset;
            channelsInfo[sysexChannel].drums = !!(
                e.data[7] > 0 && e.data[5] >> 4
            );
            continue;
        }

        // Program change
        const chNum = (e.statusByte & 0xf) + portOffset;
        const channel = channelsInfo[chNum];
        if (status === midiMessageTypes.programChange) {
            const sentProgram = e.data[0];
            const patch: MIDIPatch = {
                program: sentProgram,
                bankLSB: channel.lastBankLSB?.data?.[1] ?? 0,
                // Make sure to take bank offset into account
                bankMSB: Math.max(
                    channel.lastBank?.data?.[1] ?? 0 - mid.bankOffset,
                    0
                ),
                isGMGSDrum: channel.drums
            };
            const targetPreset = soundBank.getPreset(patch, system);
            SpessaSynthInfo(
                `%cInput patch: %c${toMIDIString(patch)}%c. Channel %c${chNum}%c. Changing patch to ${targetPreset.toString()}.`,
                consoleColors.info,
                consoleColors.unrecognized,
                consoleColors.info,
                consoleColors.recognized,
                consoleColors.info
            );
            // Set the program number
            e.data[0] = targetPreset.program;

            if (channel.lastBank === undefined) {
                continue;
            }
            channel.lastBank.data[1] = Math.min(
                targetPreset.bankMSB + bankOffset,
                127
            );
            if (channel.lastBankLSB === undefined) {
                continue;
            }
            channel.lastBankLSB.data[1] = targetPreset.bankLSB;
            continue;
        }

        // Controller change
        // We only care about bank-selects
        const isLSB = e.data[0] === midiControllers.bankSelectLSB;
        if (e.data[0] !== midiControllers.bankSelect && !isLSB) {
            continue;
        }
        // Bank select
        channel.hasBankSelect = true;
        // Interpret
        if (isLSB) {
            channel.lastBankLSB = e;
        } else {
            channel.lastBank = e;
        }
    }

    // Add missing bank selects
    // Add all bank selects that are missing for this track
    channelsInfo.forEach((has, ch) => {
        if (has.hasBankSelect) {
            return;
        }
        // Find the first program change (for the given channel)
        const midiChannel = ch % 16;
        const status = midiMessageTypes.programChange | midiChannel;
        // Find track with this channel being used
        const portOffset = Math.floor(ch / 16) * 16;
        const port = mid.portChannelOffsetMap.indexOf(portOffset);
        const track = mid.tracks.find(
            (t) => t.port === port && t.channels.has(midiChannel)
        );
        if (track === undefined) {
            // This channel is not used at all
            return;
        }
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
            if (programIndex === -1) {
                // No voices??? skip
                return;
            }
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
            track.addEvent(
                new MIDIMessage(
                    programTicks,
                    (midiMessageTypes.programChange |
                        midiChannel) as MIDIMessageType,
                    new IndexedByteArray([targetProgram])
                ),
                programIndex
            );
            indexToAdd = programIndex;
        }
        SpessaSynthInfo(
            `%cAdding bank select for %c${ch}`,
            consoleColors.info,
            consoleColors.recognized
        );
        const ticks = track.events[indexToAdd].ticks;
        const targetBank =
            soundBank.getPreset(
                {
                    bankLSB: 0,
                    bankMSB: 0,
                    program: has.program,
                    isGMGSDrum: has.drums
                },
                system
            )?.bankMSB + bankOffset || bankOffset;
        track.addEvent(
            new MIDIMessage(
                ticks,
                (midiMessageTypes.controllerChange |
                    midiChannel) as MIDIMessageType,
                new IndexedByteArray([midiControllers.bankSelect, targetBank])
            ),
            indexToAdd
        );
    });

    // Make sure to put xg if gm
    if (system !== "gs" && !isSystemXG(system)) {
        for (const m of unwantedSystems) {
            const track = mid.tracks[m.tNum];
            track.deleteEvent(track.events.indexOf(m.e));
        }
        let index = 0;
        if (mid.tracks[0].events[0].statusByte === midiMessageTypes.trackName) {
            index++;
        }
        mid.tracks[0].addEvent(getGsOn(0), index);
    }
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
    SpessaSynthGroup("%cWriting the RMIDI File...", consoleColors.info);
    SpessaSynthInfo("metadata", metadata);
    SpessaSynthInfo("Initial bank offset", mid.bankOffset);
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

    Object.entries(mid.rmidiInfo).forEach((v) => {
        const type = v[0] as keyof RMIDInfoData;
        const data = v[1];
        const writeInfo = (type: RMIDInfoFourCC) => {
            infoContent.push(writeRIFFChunkRaw(type, data));
        };
        switch (type) {
            case "album":
                // Note that there are two album chunks: IPRD and IALB
                // Spessasynth uses IPRD, but writes both
                writeInfo("IALB");
                writeInfo("IPRD");
                break;

            case "software":
                writeInfo("ISFT");
                break;

            case "infoEncoding":
                writeInfo("IENC");
                break;

            case "creationDate":
                writeInfo("ICRD");
                break;

            case "picture":
                writeInfo("IPIC");
                break;

            case "name":
                writeInfo("INAM");
                break;

            case "artist":
                writeInfo("IART");
                break;

            case "genre":
                writeInfo("IGNR");
                break;

            case "copyright":
                writeInfo("ICOP");
                break;

            case "comment":
                writeInfo("ICMT");
                break;

            case "engineer":
                writeInfo("IENG");
                break;

            case "subject":
                writeInfo("ISBJ");
                break;

            case "midiEncoding":
                writeInfo("MENC");
                break;
        }
    });

    // Bank offset
    const DBNK = new IndexedByteArray(2);
    writeLittleEndianIndexed(DBNK, options.bankOffset, 2);
    infoContent.push(writeRIFFChunkRaw("DBNK", DBNK));

    // Combine and write out
    SpessaSynthInfo("%cFinished!", consoleColors.info);
    SpessaSynthGroupEnd();
    return writeRIFFChunkParts("RIFF", [
        getStringBytes("RMID"),
        writeRIFFChunkRaw("data", newMid),
        writeRIFFChunkParts("INFO", infoContent, true),
        new IndexedByteArray(soundBankBinary)
    ]).buffer;
}
