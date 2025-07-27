import { dataBytesAmount, getChannel, MIDIMessage } from "./midi_message";
import { IndexedByteArray } from "../utils/indexed_array";
import { consoleColors } from "../utils/other";
import { SpessaSynthGroupCollapsed, SpessaSynthGroupEnd, SpessaSynthInfo, SpessaSynthWarn } from "../utils/loggin";
import { readRIFFChunk } from "../soundbank/basic_soundbank/riff_chunk";
import { readVariableLengthQuantity } from "../utils/byte_functions/variable_length_quantity";
import { readBytesAsUintBigEndian } from "../utils/byte_functions/big_endian";
import { readBytesAsString } from "../utils/byte_functions/string";
import { readLittleEndian } from "../utils/byte_functions/little_endian";
import { type MIDIMessageType, type RMIDINFOChunk, RMIDINFOChunks } from "./enums";
import { BasicMIDI } from "./basic_midi";
import { loadXMF } from "./xmf_loader";
import type { MIDIFormat } from "./types";

/**
 * midi_loader.js
 * purpose:
 * parses a midi file for the sequencer,
 * including things like marker or CC 2/4 loop detection, copyright detection, etc.
 */

type InternalMIDIChunkType = {
    type: string;
    size: number;
    data: IndexedByteArray;
};

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
    fileName: string = ""
) {
    SpessaSynthGroupCollapsed(`%cParsing MIDI File...`, consoleColors.info);
    outputMIDI.fileName = fileName;
    const binaryData = new IndexedByteArray(arrayBuffer);
    let fileByteArray: IndexedByteArray = binaryData;

    const readMIDIChunk = (
        fileByteArray: IndexedByteArray
    ): InternalMIDIChunkType => {
        const type = readBytesAsString(fileByteArray, 4);
        const size = readBytesAsUintBigEndian(fileByteArray, 4);
        const data = new IndexedByteArray(size);
        const chunk: InternalMIDIChunkType = {
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

    // check for rmid
    const initialString = readBytesAsString(binaryData, 4);
    binaryData.currentIndex -= 4;
    if (initialString === "RIFF") {
        // possibly an RMID file (https://github.com/spessasus/sf2-rmidi-specification#readme)
        // skip size
        binaryData.currentIndex += 8;
        const rmid = readBytesAsString(binaryData, 4, false);
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
        // outputMIDI is a rmid, load the midi into an array for parsing
        fileByteArray = riff.chunkData;

        // keep loading chunks until we get the "SFBK" header
        while (binaryData.currentIndex <= binaryData.length) {
            const startIndex = binaryData.currentIndex;
            const currentChunk = readRIFFChunk(binaryData, true);
            if (currentChunk.header === "RIFF") {
                const type = readBytesAsString(
                    currentChunk.chunkData,
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
                }
            } else if (currentChunk.header === "LIST") {
                const type = readBytesAsString(currentChunk.chunkData, 4);
                if (type === "INFO") {
                    SpessaSynthInfo(
                        "%cFound RMIDI INFO chunk!",
                        consoleColors.recognized
                    );
                    outputMIDI.RMIDInfo = {};
                    while (
                        currentChunk.chunkData.currentIndex <= currentChunk.size
                    ) {
                        const infoChunk = readRIFFChunk(
                            currentChunk.chunkData,
                            true
                        );
                        outputMIDI.RMIDInfo[infoChunk.header as RMIDINFOChunk] =
                            infoChunk.chunkData;
                    }
                    if (outputMIDI.RMIDInfo["ICOP"]) {
                        // special case, overwrites the copyright components array
                        outputMIDI.copyright = readBytesAsString(
                            outputMIDI.RMIDInfo["ICOP"],
                            outputMIDI.RMIDInfo["ICOP"].length,
                            false
                        ).replaceAll("\n", " ");
                    }
                    if (outputMIDI.RMIDInfo["INAM"]) {
                        outputMIDI.rawMidiName = outputMIDI.RMIDInfo[
                            RMIDINFOChunks.name
                        ] as IndexedByteArray;
                        outputMIDI.midiName = readBytesAsString(
                            outputMIDI.rawMidiName as IndexedByteArray,
                            outputMIDI.rawMidiName.length,
                            false
                        ).replaceAll("\n", " ");
                    }
                    // these can be used interchangeably
                    if (
                        outputMIDI.RMIDInfo["IALB"] &&
                        !outputMIDI.RMIDInfo["IPRD"]
                    ) {
                        outputMIDI.RMIDInfo["IPRD"] =
                            outputMIDI.RMIDInfo["IALB"];
                    }
                    if (
                        outputMIDI.RMIDInfo["IPRD"] &&
                        !outputMIDI.RMIDInfo["IALB"]
                    ) {
                        outputMIDI.RMIDInfo["IALB"] =
                            outputMIDI.RMIDInfo["IPRD"];
                    }
                    outputMIDI.bankOffset = 1; // defaults to 1
                    if (outputMIDI.RMIDInfo[RMIDINFOChunks.bankOffset]) {
                        outputMIDI.bankOffset = readLittleEndian(
                            outputMIDI.RMIDInfo[RMIDINFOChunks.bankOffset] ||
                                new IndexedByteArray(0),
                            2
                        );
                    }
                }
            }
        }

        if (outputMIDI.isDLSRMIDI) {
            // Assume bank offset of 0 by default. If we find any bank selects, then the offset is 1.
            outputMIDI.bankOffset = 0;
        }

        // if no embedded bank, assume 0
        if (outputMIDI.embeddedSoundBank === undefined) {
            outputMIDI.bankOffset = 0;
        }
    } else if (initialString === "XMF_") {
        // XMF file
        fileByteArray = loadXMF(outputMIDI, binaryData);
    } else {
        fileByteArray = binaryData;
    }
    const headerChunk = readMIDIChunk(fileByteArray);
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

    // format
    outputMIDI.format = readBytesAsUintBigEndian(
        headerChunk.data,
        2
    ) as MIDIFormat;
    // tracks count
    outputMIDI.tracksAmount = readBytesAsUintBigEndian(headerChunk.data, 2);
    // time division
    outputMIDI.timeDivision = readBytesAsUintBigEndian(headerChunk.data, 2);
    // read all the tracks
    for (let i = 0; i < outputMIDI.tracksAmount; i++) {
        const track: MIDIMessage[] = [];
        const trackChunk = readMIDIChunk(fileByteArray);

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
        // format 2 plays sequentially
        if (outputMIDI.format === 2 && i > 0) {
            totalTicks +=
                outputMIDI.tracks[i - 1][outputMIDI.tracks[i - 1].length - 1]
                    .ticks;
        }
        // loop until we reach the end of track
        while (trackChunk.data.currentIndex < trackChunk.size) {
            totalTicks += readVariableLengthQuantity(trackChunk.data);

            // check if the status byte is valid (IE. larger than 127)
            const statusByteCheck =
                trackChunk.data[trackChunk.data.currentIndex];

            let statusByte: MIDIMessageType;
            // if we have a running byte and the status byte isn't valid
            if (runningByte !== undefined && statusByteCheck < 0x80) {
                statusByte = runningByte;
            } else {
                // noinspection PointlessBooleanExpressionJS
                if (runningByte === undefined && statusByteCheck < 0x80) {
                    // if we don't have a running byte and the status byte isn't valid, it's an error.
                    SpessaSynthGroupEnd();
                    throw new SyntaxError(
                        `Unexpected byte with no running byte. (${statusByteCheck})`
                    );
                } else {
                    // if the status byte is valid, use that
                    statusByte = trackChunk.data[
                        trackChunk.data.currentIndex++
                    ] as MIDIMessageType;
                }
            }
            const statusByteChannel = getChannel(statusByte);

            let eventDataLength;

            // determine the message's length;
            switch (statusByteChannel) {
                case -1:
                    // system common/realtime (no length)
                    eventDataLength = 0;
                    break;

                case -2:
                    // meta (the next is the actual status byte)
                    statusByte = trackChunk.data[
                        trackChunk.data.currentIndex++
                    ] as MIDIMessageType;
                    eventDataLength = readVariableLengthQuantity(
                        trackChunk.data
                    );
                    break;

                case -3:
                    // sysex
                    eventDataLength = readVariableLengthQuantity(
                        trackChunk.data
                    );
                    break;

                default:
                    // voice message
                    // gets the midi message length
                    eventDataLength =
                        dataBytesAmount[
                            (statusByte >> 4) as keyof typeof dataBytesAmount
                        ];
                    // save the status byte
                    runningByte = statusByte;
                    break;
            }

            // put the event data into the array
            const eventData = new IndexedByteArray(eventDataLength);
            eventData.set(
                trackChunk.data.slice(
                    trackChunk.data.currentIndex,
                    trackChunk.data.currentIndex + eventDataLength
                ),
                0
            );
            const event = new MIDIMessage(totalTicks, statusByte, eventData);
            track.push(event);
            // advance the track chunk
            trackChunk.data.currentIndex += eventDataLength;
        }
        outputMIDI.tracks.push(track);

        SpessaSynthInfo(
            `%cParsed %c${outputMIDI.tracks.length}%c / %c${outputMIDI.tracksAmount}`,
            consoleColors.info,
            consoleColors.value,
            consoleColors.info,
            consoleColors.value
        );
    }

    SpessaSynthInfo(`%cAll tracks parsed correctly!`, consoleColors.recognized);
    // parse the events (no need to sort as they are already sorted by the SMF specification)
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
