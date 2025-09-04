import { writeVariableLengthQuantity } from "../../utils/byte_functions/variable_length_quantity";
import { writeBigEndian } from "../../utils/byte_functions/big_endian";
import type { BasicMIDI } from "../basic_midi";
import { midiMessageTypes } from "../enums";

/**
 * Exports the midi as a standard MIDI file
 * @param midi the MIDI to write
 */
export function writeMIDIInternal(midi: BasicMIDI): ArrayBuffer {
    if (!midi.tracks) {
        throw new Error("MIDI has no tracks!");
    }
    const binaryTrackData: Uint8Array[] = [];
    for (const track of midi.tracks) {
        const binaryTrack = [];
        let currentTick = 0;
        let runningByte = undefined;
        for (const event of track.events) {
            // Ticks stored in MIDI are absolute, but SMF wants relative. Convert them here.
            const deltaTicks = Math.max(0, event.ticks - currentTick);
            // EndOfTrack is written automatically.
            if (event.statusByte === midiMessageTypes.endOfTrack) {
                currentTick += deltaTicks;
                continue;
            }
            let messageData: number[];
            // Determine the message
            if (event.statusByte <= midiMessageTypes.sequenceSpecific) {
                // This is a meta-message
                // Syntax is FF<type><length><data>
                messageData = [
                    0xff,
                    event.statusByte,
                    ...writeVariableLengthQuantity(event.data.length),
                    ...event.data
                ];
                // RP-001:
                // Sysex events and meta-events cancel any running status which was in effect.
                runningByte = undefined;
            } else if (event.statusByte === midiMessageTypes.systemExclusive) {
                // This is a system exclusive message
                // Syntax is F0<length><data>
                messageData = [
                    0xf0,
                    ...writeVariableLengthQuantity(event.data.length),
                    ...event.data
                ];
                // RP-001:
                // Sysex events and meta-events cancel any running status which was in effect.
                runningByte = undefined;
            } else {
                // This is a midi message
                messageData = [];
                if (runningByte !== event.statusByte) {
                    // Running byte was not the byte we want. Add the byte here.
                    runningByte = event.statusByte;
                    // Add the status byte to the midi
                    messageData.push(event.statusByte);
                }
                // Add the data
                messageData.push(...event.data);
            }
            // Write VLQ
            binaryTrack.push(...writeVariableLengthQuantity(deltaTicks));
            // Write the message
            binaryTrack.push(...messageData);
            currentTick += deltaTicks;
        }
        // Write endOfTrack
        binaryTrack.push(0);
        binaryTrack.push(0xff);
        binaryTrack.push(midiMessageTypes.endOfTrack);
        binaryTrack.push(0);
        binaryTrackData.push(new Uint8Array(binaryTrack));
    }

    const writeText = (text: string, arr: number[]) => {
        for (let i = 0; i < text.length; i++) {
            arr.push(text.charCodeAt(i));
        }
    };

    // Write the file
    const binaryData: number[] = [];
    // Write header
    writeText("MThd", binaryData); // MThd
    binaryData.push(...writeBigEndian(6, 4)); // Length
    binaryData.push(0, midi.format); // Format
    binaryData.push(...writeBigEndian(midi.tracks.length, 2)); // Num tracks
    binaryData.push(...writeBigEndian(midi.timeDivision, 2)); // Time division

    // Write tracks
    for (const track of binaryTrackData) {
        // Write track header
        writeText("MTrk", binaryData); // MTrk
        binaryData.push(...writeBigEndian(track.length, 4)); // Length
        binaryData.push(...track); // Write data
    }
    return new Uint8Array(binaryData).buffer;
}
