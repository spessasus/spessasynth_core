import { MIDIMessage } from "../midi_message";
import { IndexedByteArray } from "../../utils/indexed_array";
import { ConsoleColors } from "../../utils/other";
import { SpessaLog } from "../../utils/loggin";
import { readVariableLengthQuantity } from "../../utils/byte_functions/variable_length_quantity";
import { readBigEndianIndexed } from "../../utils/byte_functions/big_endian";
import { readBinaryStringIndexed } from "../../utils/byte_functions/string";
import { type MIDIMessageType, MIDIMessageTypes } from "../enums";
import { BasicMIDI } from "../basic_midi";
import type { MIDIFormat } from "../types";
import { MIDITrack } from "../midi_track";

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

const DataBytesAmount = {
    0x8: 2, // Note off
    0x9: 2, // Note on
    0xa: 2, // Note at
    0xb: 2, // Cc change
    0xc: 1, // Pg change
    0xd: 1, // Channel after touch
    0xe: 2 // Pitch wheel
} as const;

/**
 * Loads a Standard MIDI File (SMF) from given binary data
 * @param outputMIDI The BasicMIDI instance to populate with the parsed MIDI data.
 * @param smfFileBinary The IndexedByteArray containing the SMF file data.
 * @param fileName The optional name of the file, will be used if the MIDI file does not have a name.
 */
export function parseSMFInternal(
    outputMIDI: BasicMIDI,
    smfFileBinary: IndexedByteArray,
    fileName: string
) {
    SpessaLog.groupCollapsed(`%cParsing MIDI File...`, ConsoleColors.info);
    outputMIDI.fileName = fileName;

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

    const headerChunk = readMIDIChunk(smfFileBinary);
    if (headerChunk.type !== "MThd") {
        SpessaLog.groupEnd();
        throw new SyntaxError(
            `Invalid MIDI Header! Expected "MThd", got "${headerChunk.type}"`
        );
    }

    if (headerChunk.size !== 6) {
        SpessaLog.groupEnd();
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
            SpessaLog.groupEnd();
            throw new SyntaxError(
                `Invalid track header! Expected "MTrk" got "${trackChunk.type}"`
            );
        }

        /**
         * MIDI running byte
         */
        let runningByte: MIDIMessageType | undefined;

        let totalTicks = 0;
        // Format 2 plays sequentially
        if (outputMIDI.format === 2 && i > 0) {
            totalTicks +=
                outputMIDI.tracks[i - 1].events[
                    outputMIDI.tracks[i - 1].events.length - 1
                ].ticks;
        }
        const trackData = trackChunk.data;
        // Loop until we reach the end of track
        while (trackData.currentIndex < trackChunk.size) {
            totalTicks += readVariableLengthQuantity(trackData);

            // Check if the status byte is valid (IE. larger than 127)
            const statusByteCheck = trackData[trackData.currentIndex];

            let statusByte: MIDIMessageType;
            // If we have a running byte and the status byte isn't valid
            if (runningByte !== undefined && statusByteCheck < 0x80) {
                statusByte = runningByte;
            } else {
                if (statusByteCheck < 0x80) {
                    // If we don't have a running byte and the status byte isn't valid, it's an error.
                    SpessaLog.groupEnd();
                    throw new SyntaxError(
                        `Unexpected byte with no running byte. (${statusByteCheck})`
                    );
                } else {
                    // If the status byte is valid, use that
                    statusByte = statusByteCheck as MIDIMessageType;
                    trackData.currentIndex++;
                }
            }

            let dataSize;

            // Determine the message's length
            if (
                // First note off (note off on channel 0)
                statusByte >= MIDIMessageTypes.noteOff &&
                // Lower than sysex (pitch wheel on channel 15)
                statusByte < MIDIMessageTypes.systemExclusive
            ) {
                // Voice message
                // Gets the midi message length
                dataSize =
                    DataBytesAmount[
                        (statusByte >> 4) as keyof typeof DataBytesAmount
                    ];
                // Save the status byte
                runningByte = statusByte;
            } else if (statusByte === MIDIMessageTypes.systemExclusive) {
                // Sysex
                dataSize = readVariableLengthQuantity(trackData);
            } else if (statusByte === 0xff) {
                // Meta message (the next is the actual status byte)
                statusByte = trackData[
                    trackData.currentIndex++
                ] as MIDIMessageType;
                dataSize = readVariableLengthQuantity(trackData);
            } else {
                // System common/realtime (no length)
                dataSize = 0;
            }

            // Put the event data into the array
            const eventData = new IndexedByteArray(dataSize);
            eventData.set(
                trackData.slice(
                    trackData.currentIndex,
                    trackData.currentIndex + dataSize
                )
            );
            track.pushEvent(new MIDIMessage(totalTicks, statusByte, eventData));

            // Advance the track chunk
            trackData.currentIndex += dataSize;
        }
        outputMIDI.tracks.push(track);

        SpessaLog.info(
            `%cParsed %c${outputMIDI.tracks.length}%c / %c${outputMIDI.tracks.length}`,
            ConsoleColors.info,
            ConsoleColors.value,
            ConsoleColors.info,
            ConsoleColors.value
        );
    }

    SpessaLog.info(`%cAll tracks parsed correctly!`, ConsoleColors.recognized);
    // Parse the events (no need to sort as they are already sorted by the SMF specification)
    outputMIDI.flush(false);
    SpessaLog.groupEnd();
}
