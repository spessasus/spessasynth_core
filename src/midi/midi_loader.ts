import { dataBytesAmount, getChannel, MIDIMessage } from "./midi_message";
import { IndexedByteArray } from "../utils/indexed_array";
import { consoleColors } from "../utils/other";
import { SpessaSynthGroupCollapsed, SpessaSynthGroupEnd, SpessaSynthInfo, SpessaSynthWarn } from "../utils/loggin";
import { readRIFFChunk } from "../utils/riff_chunk";
import { readVariableLengthQuantity } from "../utils/byte_functions/variable_length_quantity";
import { readBigEndianIndexed } from "../utils/byte_functions/big_endian";
import { readBinaryString, readBinaryStringIndexed } from "../utils/byte_functions/string";
import { readLittleEndian } from "../utils/byte_functions/little_endian";
import { type MIDIMessageType } from "./enums";
import { BasicMIDI } from "./basic_midi";
import { loadXMF } from "./xmf_loader";
import type { MIDIFormat, RMIDInfoFourCC } from "./types";
import { MIDITrack } from "./midi_track";

/**
 * Midi_loader.ts
 * purpose:
 * parses a midi file for the sequencer,
 * including things like marker or CC 2/4 loop detection, copyright detection, etc.
 */

interface MIDIChunk {
    type: string;
    size: number;
    data: IndexedByteArray;
}

/**
 * Loads a MIDI file (SMF, RMIDI, XMF) from a given ArrayBuffer.
 * @param outputMIDI The BasicMIDI instance to populate with the parsed MIDI data.
 * @param arrayBuffer The ArrayBuffer containing the binary file data.
 * @param fileName The optional name of the file, will be used if the MIDI file does not have a name.
 * @remarks
 * This function reads the MIDI file format, extracts the header and track chunks,
 * and populates the BasicMIDI instance with the parsed data.
 * It supports Standard MIDI Files (SMF), RIFF MIDI (RMIDI), and Extensible Music Format (XMF).
 * It also handles embedded soundbanks in RMIDI files.
 * If the file is an RMIDI file, it will extract the embedded soundbank and store
 * it in the `embeddedSoundFont` property of the BasicMIDI instance.
 * If the file is an XMF file, it will parse the XMF structure and extract the MIDI data.
 */
export function loadMIDIFromArrayBufferInternal(
    outputMIDI: BasicMIDI,
    arrayBuffer: ArrayBuffer,
    fileName?: string
) {
    SpessaSynthGroupCollapsed(`%cParsing MIDI File...`, consoleColors.info);
    outputMIDI.fileName = fileName;
    const binaryData = new IndexedByteArray(arrayBuffer);
    let smfFileBinary = binaryData;

    const readMIDIChunk = (fileByteArray: IndexedByteArray): MIDIChunk => {
        const type = readBinaryStringIndexed(fileByteArray, 4);
        const size = readBigEndianIndexed(fileByteArray, 4);
        const data = new IndexedByteArray(size);
        const chunk: MIDIChunk = {
            type,
            size,
            data
        };

        const dataSlice = fileByteArray.slice(
            fileByteArray.currentIndex,
            fileByteArray.currentIndex + chunk.size
        );
        chunk.data.set(dataSlice, 0);
        fileByteArray.currentIndex += chunk.size;
        return chunk;
    };

    // Check for rmid
    const initialString = readBinaryString(binaryData, 4);
    if (initialString === "RIFF") {
        // Possibly an RMID file (https://github.com/spessasus/sf2-rmidi-specification#readme)
        // Skip size
        binaryData.currentIndex += 8;
        const rmid = readBinaryStringIndexed(binaryData, 4, false);
        if (rmid !== "RMID") {
            SpessaSynthGroupEnd();
            throw new SyntaxError(
                `Invalid RMIDI Header! Expected "RMID", got "${rmid}"`
            );
        }
        const riff = readRIFFChunk(binaryData);
        if (riff.header !== "data") {
            SpessaSynthGroupEnd();
            throw new SyntaxError(
                `Invalid RMIDI Chunk header! Expected "data", got "${rmid}"`
            );
        }
        // OutputMIDI is a rmid, load the midi into an array for parsing
        smfFileBinary = riff.data;

        let isSF2RMIDI = false;
        let foundDbnk = false;
        // Keep loading chunks until we get the "SFBK" header
        while (binaryData.currentIndex <= binaryData.length) {
            const startIndex = binaryData.currentIndex;
            const currentChunk = readRIFFChunk(binaryData, true);
            if (currentChunk.header === "RIFF") {
                const type = readBinaryStringIndexed(
                    currentChunk.data,
                    4
                ).toLowerCase();
                if (type === "sfbk" || type === "sfpk" || type === "dls ") {
                    SpessaSynthInfo(
                        "%cFound embedded soundbank!",
                        consoleColors.recognized
                    );
                    outputMIDI.embeddedSoundBank = binaryData.slice(
                        startIndex,
                        startIndex + currentChunk.size
                    ).buffer;
                } else {
                    SpessaSynthWarn(`Unknown RIFF chunk: "${type}"`);
                }
                if (type === "dls ") {
                    // Assume bank offset of 0 by default. If we find any bank selects, then the offset is 1.
                    outputMIDI.isDLSRMIDI = true;
                } else {
                    isSF2RMIDI = true;
                }
            } else if (currentChunk.header === "LIST") {
                const type = readBinaryStringIndexed(currentChunk.data, 4);
                if (type === "INFO") {
                    SpessaSynthInfo(
                        "%cFound RMIDI INFO chunk!",
                        consoleColors.recognized
                    );
                    while (
                        currentChunk.data.currentIndex <= currentChunk.size
                    ) {
                        const infoChunk = readRIFFChunk(
                            currentChunk.data,
                            true
                        );
                        const headerTyped = infoChunk.header as RMIDInfoFourCC;
                        const infoData = infoChunk.data;
                        switch (headerTyped) {
                            default:
                                SpessaSynthWarn(
                                    `Unknown RMIDI Info: ${headerTyped as string}`
                                );
                                break;

                            case "INAM":
                                outputMIDI.rmidiInfo.name = infoData;
                                break;

                            case "IALB":
                            case "IPRD":
                                // Note that there are two album chunks: IPRD and IALB
                                outputMIDI.rmidiInfo.album = infoData;
                                break;

                            case "ICRT":
                            case "ICRD":
                                // Older RMIDIs written by spessasynth erroneously used ICRT instead of ICRD.
                                outputMIDI.rmidiInfo.creationDate = infoData;
                                break;

                            case "IART":
                                outputMIDI.rmidiInfo.artist = infoData;
                                break;

                            case "IGNR":
                                outputMIDI.rmidiInfo.genre = infoData;
                                break;

                            case "IPIC":
                                outputMIDI.rmidiInfo.picture = infoData;
                                break;

                            case "ICOP":
                                outputMIDI.rmidiInfo.copyright = infoData;
                                break;

                            case "ICMT":
                                outputMIDI.rmidiInfo.comment = infoData;
                                break;

                            case "IENG":
                                outputMIDI.rmidiInfo.engineer = infoData;
                                break;

                            case "ISFT":
                                outputMIDI.rmidiInfo.software = infoData;
                                break;

                            case "ISBJ":
                                outputMIDI.rmidiInfo.subject = infoData;
                                break;

                            case "IENC":
                                outputMIDI.rmidiInfo.infoEncoding = infoData;
                                break;

                            case "MENC":
                                outputMIDI.rmidiInfo.midiEncoding = infoData;
                                break;

                            case "DBNK":
                                outputMIDI.bankOffset = readLittleEndian(
                                    infoData,
                                    2
                                );
                                foundDbnk = true;
                                break;
                        }
                    }
                }
            }
        }

        if (isSF2RMIDI && !foundDbnk) {
            outputMIDI.bankOffset = 1; // Defaults to 1
        }

        if (outputMIDI.isDLSRMIDI) {
            // Assume bank offset of 0 by default. If we find any bank selects, then the offset is 1.
            outputMIDI.bankOffset = 0;
        }

        // If no embedded bank, assume 0
        if (outputMIDI.embeddedSoundBank === undefined) {
            outputMIDI.bankOffset = 0;
        }
    } else if (initialString === "XMF_") {
        // XMF file
        smfFileBinary = loadXMF(outputMIDI, binaryData);
    } else {
        smfFileBinary = binaryData;
    }
    const headerChunk = readMIDIChunk(smfFileBinary);
    if (headerChunk.type !== "MThd") {
        SpessaSynthGroupEnd();
        throw new SyntaxError(
            `Invalid MIDI Header! Expected "MThd", got "${headerChunk.type}"`
        );
    }

    if (headerChunk.size !== 6) {
        SpessaSynthGroupEnd();
        throw new RangeError(
            `Invalid MIDI header chunk size! Expected 6, got ${headerChunk.size}`
        );
    }

    // Format
    outputMIDI.format = readBigEndianIndexed(headerChunk.data, 2) as MIDIFormat;
    // Tracks count
    const trackCount = readBigEndianIndexed(headerChunk.data, 2);
    // Time division
    outputMIDI.timeDivision = readBigEndianIndexed(headerChunk.data, 2);
    // Read all the tracks
    for (let i = 0; i < trackCount; i++) {
        const track = new MIDITrack();
        const trackChunk = readMIDIChunk(smfFileBinary);

        if (trackChunk.type !== "MTrk") {
            SpessaSynthGroupEnd();
            throw new SyntaxError(
                `Invalid track header! Expected "MTrk" got "${trackChunk.type}"`
            );
        }

        /**
         * MIDI running byte
         */
        let runningByte: MIDIMessageType | undefined = undefined;

        let totalTicks = 0;
        // Format 2 plays sequentially
        if (outputMIDI.format === 2 && i > 0) {
            totalTicks +=
                outputMIDI.tracks[i - 1].events[
                    outputMIDI.tracks[i - 1].events.length - 1
                ].ticks;
        }
        // Loop until we reach the end of track
        while (trackChunk.data.currentIndex < trackChunk.size) {
            totalTicks += readVariableLengthQuantity(trackChunk.data);

            // Check if the status byte is valid (IE. larger than 127)
            const statusByteCheck =
                trackChunk.data[trackChunk.data.currentIndex];

            let statusByte: MIDIMessageType;
            // If we have a running byte and the status byte isn't valid
            if (runningByte !== undefined && statusByteCheck < 0x80) {
                statusByte = runningByte;
            } else {
                if (statusByteCheck < 0x80) {
                    // If we don't have a running byte and the status byte isn't valid, it's an error.
                    SpessaSynthGroupEnd();
                    throw new SyntaxError(
                        `Unexpected byte with no running byte. (${statusByteCheck})`
                    );
                } else {
                    // If the status byte is valid, use that
                    statusByte = trackChunk.data[
                        trackChunk.data.currentIndex++
                    ] as MIDIMessageType;
                }
            }
            const statusByteChannel = getChannel(statusByte);

            let eventDataLength;

            // Determine the message's length;
            switch (statusByteChannel) {
                case -1:
                    // System common/realtime (no length)
                    eventDataLength = 0;
                    break;

                case -2:
                    // Meta (the next is the actual status byte)
                    statusByte = trackChunk.data[
                        trackChunk.data.currentIndex++
                    ] as MIDIMessageType;
                    eventDataLength = readVariableLengthQuantity(
                        trackChunk.data
                    );
                    break;

                case -3:
                    // Sysex
                    eventDataLength = readVariableLengthQuantity(
                        trackChunk.data
                    );
                    break;

                default:
                    // Voice message
                    // Gets the midi message length
                    eventDataLength =
                        dataBytesAmount[
                            (statusByte >> 4) as keyof typeof dataBytesAmount
                        ];
                    // Save the status byte
                    runningByte = statusByte;
                    break;
            }

            // Put the event data into the array
            const eventData = new IndexedByteArray(eventDataLength);
            eventData.set(
                trackChunk.data.slice(
                    trackChunk.data.currentIndex,
                    trackChunk.data.currentIndex + eventDataLength
                ),
                0
            );
            const event = new MIDIMessage(totalTicks, statusByte, eventData);
            track.pushEvent(event);

            // Advance the track chunk
            trackChunk.data.currentIndex += eventDataLength;
        }
        outputMIDI.tracks.push(track);

        SpessaSynthInfo(
            `%cParsed %c${outputMIDI.tracks.length}%c / %c${outputMIDI.tracks.length}`,
            consoleColors.info,
            consoleColors.value,
            consoleColors.info,
            consoleColors.value
        );
    }

    SpessaSynthInfo(`%cAll tracks parsed correctly!`, consoleColors.recognized);
    // Parse the events (no need to sort as they are already sorted by the SMF specification)
    outputMIDI.flush(false);
    SpessaSynthGroupEnd();
    SpessaSynthInfo(
        `%cMIDI file parsed. Total tick time: %c${outputMIDI.lastVoiceEventTick}%c, total seconds time: %c${outputMIDI.duration}`,
        consoleColors.info,
        consoleColors.recognized,
        consoleColors.info,
        consoleColors.recognized
    );
}
