import { IndexedByteArray } from "../../utils/indexed_array";
import { writeRIFFChunkParts, writeRIFFChunkRaw } from "../../utils/riff_chunk";
import { getStringBytes } from "../../utils/byte_functions/string";
import { MIDIMessage } from "../midi_message";
import {
    SpessaSynthGroup,
    SpessaSynthGroupEnd,
    SpessaSynthInfo
} from "../../utils/loggin";
import { consoleColors } from "../../utils/other";
import { writeLittleEndianIndexed } from "../../utils/byte_functions/little_endian";
import { DEFAULT_PERCUSSION } from "../../synthesizer/audio_engine/engine_components/synth_constants";
import { chooseBank, isSystemXG, parseBankSelect } from "../../utils/xg_hacks";
import {
    isGM2On,
    isGMOn,
    isGSDrumsOn,
    isGSOn,
    isXGOn
} from "../../utils/sysex_detector";
import {
    midiControllers,
    type MIDIMessageType,
    midiMessageTypes,
    rmidInfoChunks
} from "../enums";
import type { BasicSoundBank } from "../../soundbank/basic_soundbank/basic_soundbank";
import type { RMIDIWriteOptions } from "../types";
import type { BasicMIDI } from "../basic_midi";
import { getGsOn } from "./get_gs_on";
import type { SynthSystem } from "../../synthesizer/types";

const FORCED_ENCODING = "utf-8";
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
        const channel: {
            program: number;
            drums: boolean;
            lastBank?: MIDIMessage;
            lastBankLSB?: MIDIMessage;
            hasBankSelect: boolean;
        } = channelsInfo[chNum];
        if (status === midiMessageTypes.programChange) {
            const isXG = isSystemXG(system);
            // Check if the preset for this program exists
            const initialProgram = e.data[0];
            if (channel.drums) {
                if (
                    soundBank.presets.findIndex(
                        (p) =>
                            p.program === initialProgram &&
                            p.isDrumPreset(isXG, true)
                    ) === -1
                ) {
                    // Doesn't exist. pick any preset that has bank 128.
                    e.data[0] =
                        soundBank.presets.find((p) => p.isDrumPreset(isXG))
                            ?.program ?? 0;
                    SpessaSynthInfo(
                        `%cNo drum preset %c${initialProgram}%c. Channel %c${chNum}%c. Changing program to ${e.data[0]}.`,
                        consoleColors.info,
                        consoleColors.unrecognized,
                        consoleColors.info,
                        consoleColors.recognized,
                        consoleColors.info
                    );
                }
            } else {
                if (
                    soundBank.presets.findIndex(
                        (p) =>
                            p.program === initialProgram &&
                            !p.isDrumPreset(isXG)
                    ) === -1
                ) {
                    // Doesn't exist. pick any preset that does not have bank 128.
                    e.data[0] =
                        soundBank.presets.find((p) => !p.isDrumPreset(isXG))
                            ?.program ?? 0;
                    SpessaSynthInfo(
                        `%cNo preset %c${initialProgram}%c. Channel %c${chNum}%c. Changing program to ${e.data[0]}.`,
                        consoleColors.info,
                        consoleColors.unrecognized,
                        consoleColors.info,
                        consoleColors.recognized,
                        consoleColors.info
                    );
                }
            }
            channel.program = e.data[0];
            // Check if this preset exists for program and bank
            if (channel.lastBank === undefined) {
                continue;
            }
            const realBank = Math.max(
                0,
                channel.lastBank.data[1] - mid.bankOffset
            ); // Make sure to take the previous bank offset into account
            const bankLSB = channel?.lastBankLSB
                ? channel.lastBankLSB.data[1] - mid.bankOffset
                : 0;
            // Adjust bank for XG
            let bank = chooseBank(realBank, bankLSB, channel.drums, isXG);
            if (
                soundBank.presets.findIndex(
                    (p) => p.bank === bank && p.program === e.data[0]
                ) === -1
            ) {
                // No preset with this bank. find this program with any bank
                const found = soundBank.presets.find(
                    (p) => p.program === e.data[0]
                );
                let targetBank = bankOffset;
                if (found) {
                    targetBank = bankOffset + found.bank;
                }
                channel.lastBank.data[1] = targetBank;
                if (channel?.lastBankLSB?.data) {
                    channel.lastBankLSB.data[1] = targetBank;
                }
                SpessaSynthInfo(
                    `%cNo preset %c${bank}:${e.data[0]}%c. Channel %c${chNum}%c. Changing bank to ${targetBank}.`,
                    consoleColors.info,
                    consoleColors.unrecognized,
                    consoleColors.info,
                    consoleColors.recognized,
                    consoleColors.info
                );
            } else {
                // There is a preset with this bank. Add offset. For drums add the normal offset.
                const drumBank = bank;
                if (isSystemXG(system) && bank === 128) {
                    bank = 127;
                }
                const newBank = (bank === 128 ? 128 : drumBank) + bankOffset;
                channel.lastBank.data[1] = newBank;
                if (channel?.lastBankLSB?.data && !channel.drums) {
                    channel.lastBankLSB.data[1] =
                        channel.lastBankLSB.data[1] -
                        mid.bankOffset +
                        bankOffset;
                }
                SpessaSynthInfo(
                    `%cPreset %c${bank}:${e.data[0]}%c exists. Channel %c${chNum}%c.  Changing bank to ${newBank}.`,
                    consoleColors.info,
                    consoleColors.recognized,
                    consoleColors.info,
                    consoleColors.recognized,
                    consoleColors.info
                );
            }
            continue;
        }

        // Controller change
        // We only care about bank-selects
        const isLSB = e.data[0] === midiControllers.lsbForControl0BankSelect;
        if (e.data[0] !== midiControllers.bankSelect && !isLSB) {
            continue;
        }
        // Bank select
        channel.hasBankSelect = true;
        const bankNumber = e.data[1];
        // Interpret
        const interpretation = parseBankSelect(
            channel?.lastBank?.data[1] ?? 0,
            bankNumber,
            system,
            isLSB,
            channel.drums,
            chNum
        );
        if (interpretation.drumsStatus === 2) {
            channel.drums = true;
        } else if (interpretation.drumsStatus === 1) {
            channel.drums = false;
        }
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
            const targetProgram = soundBank.getPreset(0, 0).program;
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
            soundBank.getPreset(0, has.program, isSystemXG(system))?.bank +
                bankOffset || bankOffset;
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
    encoding: "Shift_JIS",
    metadata: {
        midiEncoding: "Shift_JIS"
    },
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
    let encoding = options.encoding;
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

    // Info data for RMID
    const infoContent: Uint8Array[] = [];
    const encoder = new TextEncoder();
    // Software (SpessaSynth)
    infoContent.push(
        writeRIFFChunkRaw(
            rmidInfoChunks.software,
            encoder.encode("SpessaSynth"),
            true
        )
    );
    // Name
    if (metadata.name) {
        infoContent.push(
            writeRIFFChunkRaw(
                rmidInfoChunks.name,
                encoder.encode(metadata.name),
                true
            )
        );
        encoding = FORCED_ENCODING;
    } else {
        if (mid.rawName) {
            infoContent.push(
                writeRIFFChunkRaw(rmidInfoChunks.name, mid.rawName, true)
            );
        } else {
            const bytes = encoder.encode(mid.name);
            infoContent.push(
                writeRIFFChunkRaw(rmidInfoChunks.name, bytes, true)
            );
        }
    }
    // Creation date
    if (metadata.creationDate) {
        encoding = FORCED_ENCODING;
        infoContent.push(
            writeRIFFChunkRaw(
                rmidInfoChunks.creationDate,
                encoder.encode(metadata.creationDate),
                true
            )
        );
    } else {
        const today = new Date().toISOString();
        infoContent.push(
            writeRIFFChunkRaw(
                rmidInfoChunks.creationDate,
                getStringBytes(today, true),
                true
            )
        );
    }
    // Comment
    if (metadata.comment) {
        encoding = FORCED_ENCODING;
        infoContent.push(
            writeRIFFChunkRaw(
                rmidInfoChunks.comment,
                encoder.encode(metadata.comment)
            )
        );
    }
    // Engineer
    if (metadata.engineer) {
        infoContent.push(
            writeRIFFChunkRaw(
                rmidInfoChunks.engineer,
                encoder.encode(metadata.engineer),
                true
            )
        );
    }
    // Album
    if (metadata.album) {
        // Note that there are two album chunks: IPRD and IALB
        // Spessasynth uses IPRD, but writes both
        encoding = FORCED_ENCODING;
        infoContent.push(
            writeRIFFChunkRaw(
                rmidInfoChunks.album,
                encoder.encode(metadata.album),
                true
            )
        );
        infoContent.push(
            writeRIFFChunkRaw("IALB", encoder.encode(metadata.album), true)
        );
    }
    // Artist
    if (metadata.artist) {
        encoding = FORCED_ENCODING;
        infoContent.push(
            writeRIFFChunkRaw(
                rmidInfoChunks.artist,
                encoder.encode(metadata.artist),
                true
            )
        );
    }
    // Genre
    if (metadata.genre) {
        encoding = FORCED_ENCODING;
        infoContent.push(
            writeRIFFChunkRaw(
                rmidInfoChunks.genre,
                encoder.encode(metadata.genre),
                true
            )
        );
    }
    // Picture
    if (metadata.picture) {
        infoContent.push(
            writeRIFFChunkRaw(
                rmidInfoChunks.picture,
                new Uint8Array(metadata.picture)
            )
        );
    }
    // Copyright
    if (metadata.copyright) {
        encoding = FORCED_ENCODING;
        infoContent.push(
            writeRIFFChunkRaw(
                rmidInfoChunks.copyright,
                encoder.encode(metadata.copyright),
                true
            )
        );
    } else {
        // Use midi copyright if possible
        infoContent.push(
            writeRIFFChunkRaw(
                rmidInfoChunks.copyright,
                mid.rmidiInfo.ICOP ?? getStringBytes(DEFAULT_COPYRIGHT, true)
            )
        );
    }

    // Bank offset
    const DBNK = new IndexedByteArray(2);
    writeLittleEndianIndexed(DBNK, options.bankOffset, 2);
    infoContent.push(writeRIFFChunkRaw(rmidInfoChunks.bankOffset, DBNK));
    // Midi encoding
    if (metadata.midiEncoding !== undefined) {
        infoContent.push(
            writeRIFFChunkRaw(
                rmidInfoChunks.midiEncoding,
                encoder.encode(metadata.midiEncoding)
            )
        );
    }
    // Encoding
    infoContent.push(
        writeRIFFChunkRaw(
            rmidInfoChunks.encoding,
            getStringBytes(encoding, true)
        )
    );

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
