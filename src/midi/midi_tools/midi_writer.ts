import { writeVariableLengthQuantity } from "../../utils/byte_functions/variable_length_quantity";
import { writeBytesAsUintBigEndian } from "../../utils/byte_functions/big_endian";
import type { BasicMIDI } from "../basic_midi";
import { midiMessageTypes } from "../enums";

/**
 * Exports the midi as a standard MIDI file
 * @param midi the MIDI to write
 */
export function writeMIDIInternal(midi: BasicMIDI): Uint8Array<ArrayBuffer> {
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
            let messageData: number[];
            // determine the message
            if (event.statusByte <= midiMessageTypes.sequenceSpecific) {
                // this is a meta-message
                // syntax is FF<type><length><data>
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
                // this is a system exclusive message
                // syntax is F0<length><data>
                messageData = [
                    0xf0,
                    ...writeVariableLengthQuantity(event.data.length),
                    ...event.data
                ];
                // RP-001:
                // Sysex events and meta-events cancel any running status which was in effect.
                runningByte = undefined;
            } else {
                // this is a midi message
                messageData = [];
                if (runningByte !== event.statusByte) {
                    // Running byte was not the byte we want. Add the byte here.
                    runningByte = event.statusByte;
                    // add the status byte to the midi
                    messageData.push(event.statusByte);
                }
                // add the data
                messageData.push(...event.data);
            }
            // write VLQ
            binaryTrack.push(...writeVariableLengthQuantity(deltaTicks));
            // write the message
            binaryTrack.push(...messageData);
            currentTick += deltaTicks;
        }
        // write endOfTrack
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

    // write the file
    const binaryData: number[] = [];
    // write header
    writeText("MThd", binaryData); // MThd
    binaryData.push(...writeBytesAsUintBigEndian(6, 4)); // length
    binaryData.push(0, midi.format); // format
    binaryData.push(...writeBytesAsUintBigEndian(midi.tracks.length, 2)); // num tracks
    binaryData.push(...writeBytesAsUintBigEndian(midi.timeDivision, 2)); // time division

    // write tracks
    for (const track of binaryTrackData) {
        // write track header
        writeText("MTrk", binaryData); // MTrk
        binaryData.push(...writeBytesAsUintBigEndian(track.length, 4)); // length
        binaryData.push(...track); // write data
    }
    return new Uint8Array(binaryData);
}
