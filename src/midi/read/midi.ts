import { MIDIMessage } from "../midi_message";
import { IndexedByteArray } from "../../utils/indexed_array";
import { ConsoleColors } from "../../utils/other";
import { SpessaLog } from "../../utils/loggin";
import {
    MAX_VLQ,
    readVariableLengthQuantity
} from "../../utils/byte_functions/variable_length_quantity";
import { readBigEndianIndexed } from "../../utils/byte_functions/big_endian";
import { readBinaryStringIndexed } from "../../utils/byte_functions/string";
import { type MIDIMessageType, MIDIMessageTypes } from "../enums";
import { BasicMIDI } from "../basic_midi";
import type { MIDIFormat } from "../types";
import { MIDITrack } from "../midi_track";

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

    // Damaged files are read as far as they make sense, each problem is logged here
    let damaged = false;
    const warnDamaged = (message: string) => {
        damaged = true;
        SpessaLog.warn(message);
    };

    const readMIDIChunk = (): MIDIChunk => {
        const type = readBinaryStringIndexed(smfFileBinary, 4);
        const size = readBigEndianIndexed(smfFileBinary, 4);
        // A truncated file has a chunk size past its end.
        // Only the bytes that exist are read, padding them would turn the zeros into events
        const data = smfFileBinary.slice(
            smfFileBinary.currentIndex,
            smfFileBinary.currentIndex + size
        );
        if (data.length < size) {
            warnDamaged(
                `${type} chunk is truncated: ${size} bytes declared, ${data.length} left in the file.`
            );
        }
        smfFileBinary.currentIndex += size;
        return { type, size, data };
    };

    const headerChunk = readMIDIChunk();
    if (headerChunk.type !== "MThd") {
        SpessaLog.groupEnd();
        throw new SyntaxError(
            `Invalid MIDI Header! Expected "MThd", got "${headerChunk.type}"`
        );
    }

    // The spec allows a longer header (the extra bytes are skipped), but a header that isn't 6 bytes is rejected.
    // We keep it strict like the chunk check below, a wrong size here usually means the file isn't a MIDI file
    if (headerChunk.size !== 6 || headerChunk.data.length < 6) {
        SpessaLog.groupEnd();
        throw new RangeError(
            `Invalid MIDI header chunk size! Expected 6, got ${headerChunk.size} (${headerChunk.data.length} in the file)`
        );
    }

    // Format
    outputMIDI.format = readBigEndianIndexed(headerChunk.data, 2) as MIDIFormat;
    // Tracks count
    const trackCount = readBigEndianIndexed(headerChunk.data, 2);
    // Time division
    outputMIDI.timeDivision = readBigEndianIndexed(headerChunk.data, 2);
    let formatTwoStart = 0;
    // Read all the tracks
    for (let i = 0; i < trackCount; i++) {
        // A file cut before its last tracks keeps the ones that are there.
        // Less than a chunk header left is a cut or junk at the end
        if (smfFileBinary.currentIndex + 8 > smfFileBinary.length) {
            warnDamaged(
                `The file ends after ${i} of ${trackCount} tracks, the rest are missing.`
            );
            break;
        }
        const track = new MIDITrack();
        const trackChunk = readMIDIChunk();

        // Any other chunk ends the file with an error, including alien chunks the spec says to skip
        // And junk after the last real track when the header promises more tracks.
        // We keep it strict because a damaged chunk size also lands here, and guessing where the next track
        // Starts (searching for "MTrk") could read garbage as events
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

        // Format 2 plays sequentially, each track starts where the previous one ended
        // (an empty track ends where it started)
        let totalTicks = formatTwoStart;
        const trackData = trackChunk.data;
        const trackEnd = trackData.length;

        // The length of a SysEx or meta event, or -1 when the track ends inside it
        const readLength = () => {
            if (trackData.currentIndex >= trackEnd) return -1;
            const length = readVariableLengthQuantity(trackData);
            // The last byte still has the continuation bit: the end of the track cut the length
            return trackData[trackData.currentIndex - 1] >= 0x80 ? -1 : length;
        };

        // Loop until we reach the end of track.
        // We read on after End of Track (flush removes it if it isn't last), so padding after it becomes events
        // In the rare files that have it
        while (trackData.currentIndex < trackEnd) {
            // A delta time is at most 4 bytes, a longer one only comes from a damaged file
            totalTicks += Math.min(
                readVariableLengthQuantity(trackData),
                MAX_VLQ
            );

            // A track that ends after a delta time is truncated
            if (trackData.currentIndex >= trackEnd) {
                warnDamaged(`Track ${i + 1} ends without an event.`);
                break;
            }

            // Check if the status byte is valid (IE. larger than 127)
            const statusByteCheck = trackData[trackData.currentIndex];

            let statusByte: MIDIMessageType;
            // If we have a running byte and the status byte isn't valid
            if (runningByte !== undefined && statusByteCheck < 0x80) {
                statusByte = runningByte;
            } else {
                if (statusByteCheck < 0x80) {
                    // If we don't have a running byte and the status byte isn't valid, it's an error.
                    // We throw for the whole file here instead of dropping the track,
                    // A track that starts with a data byte is usually not a MIDI track at all
                    SpessaLog.groupEnd();
                    throw new SyntaxError(
                        `Unexpected byte with no running byte. (${statusByteCheck})`
                    );
                }
                // If the status byte is valid, use that
                statusByte = statusByteCheck as MIDIMessageType;
                trackData.currentIndex++;
            }

            let dataSize;
            // A note message cut by the end of the track is kept, its missing bytes read as 0
            // (a velocity of 0 is a note off, and the note may need it to end).
            // Any other cut message is dropped, a 0 there would apply a real value (a full pitch bend down)
            let keepIfCut = false;
            let isMeta = false;

            // Determine the message's length
            if (
                // First note off (note off on channel 0)
                statusByte >= MIDIMessageTypes.noteOff &&
                // Lower than sysex (pitch wheel on channel 15)
                statusByte < MIDIMessageTypes.systemExclusive
            ) {
                // Voice message
                // Gets the midi message length.
                // A data byte of 0x80 or higher is a broken value (a key with its top bit set, a volume of 128).
                // The delta times around it show it is still data, so the message keeps its length
                dataSize =
                    DataBytesAmount[
                        (statusByte >> 4) as keyof typeof DataBytesAmount
                    ];
                keepIfCut = statusByte < MIDIMessageTypes.polyPressure;
                // Save the status byte
                runningByte = statusByte;
            } else if (
                statusByte === MIDIMessageTypes.systemExclusive ||
                statusByte === MIDIMessageTypes.systemExclusiveEscape
            ) {
                // Sysex or sysex escape/continuation, both have a length
                dataSize = readLength();
            } else if (statusByte === 0xff) {
                // Meta message (the next is the actual status byte)
                if (trackData.currentIndex < trackEnd) {
                    statusByte = trackData[
                        trackData.currentIndex++
                    ] as MIDIMessageType;
                    isMeta = true;
                    dataSize = readLength();
                } else dataSize = -1;
            } else {
                // System common/realtime. A MIDI file can't hold these, so one here is a stray byte from a damaged
                // File and the bytes after it are the next delta time, not its data (the writer writes no data either)
                dataSize = 0;
            }

            // The end of the track cut this event
            if (
                dataSize === -1 ||
                (!keepIfCut && trackData.currentIndex + dataSize > trackEnd)
            ) {
                warnDamaged(
                    `Track ${i + 1} ends inside an event (${dataSize === -1 ? "its header" : `${dataSize} bytes declared, ${trackEnd - trackData.currentIndex} left`}), dropping it.`
                );
                break;
            }

            if (trackData.currentIndex + dataSize > trackEnd) {
                warnDamaged(
                    `Track ${i + 1} ends inside a note message, its missing data bytes are 0.`
                );
            }

            // A meta type of 0x80 or higher is damage, stored as it is it would look like a voice message
            if (isMeta && statusByte >= 0x80) {
                warnDamaged(
                    `Track ${i + 1} has a meta event with the invalid type ${statusByte.toString(16)}, skipping it.`
                );
                trackData.currentIndex += dataSize;
                continue;
            }

            // Put the event data into the array
            const eventData = new IndexedByteArray(dataSize);
            eventData.set(
                trackData.subarray(
                    trackData.currentIndex,
                    trackData.currentIndex + dataSize
                )
            );
            track.pushEvents(
                new MIDIMessage(totalTicks, statusByte, eventData)
            );

            // Advance the track chunk
            trackData.currentIndex += dataSize;
        }
        outputMIDI.tracks.push(track);
        if (outputMIDI.format === 2)
            formatTwoStart = track.events.at(-1)?.ticks ?? formatTwoStart;

        SpessaLog.info(
            `%cParsed %c${outputMIDI.tracks.length}%c / %c${trackCount}`,
            ConsoleColors.info,
            ConsoleColors.value,
            ConsoleColors.info,
            ConsoleColors.value
        );
    }

    // A file cut right after its header has nothing to play
    if (trackCount > 0 && outputMIDI.tracks.length === 0) {
        SpessaLog.groupEnd();
        throw new RangeError("The MIDI file ends before its first track.");
    }

    if (damaged) {
        SpessaLog.warn("The MIDI file is damaged, parsed what was readable.");
    } else {
        SpessaLog.info(
            `%cAll tracks parsed correctly!`,
            ConsoleColors.recognized
        );
    }
    // Parse the events (no need to sort as they are already sorted by the SMF specification)
    outputMIDI.flush(false);
    SpessaLog.groupEnd();
}
