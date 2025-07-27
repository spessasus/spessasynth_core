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
        for (const event of track) {
            // Ticks stored in MIDI are absolute, but SMF wants relative. Convert them here.
            const deltaTicks = event.ticks - currentTick;
            let messageData: number[];
            // determine the message
            if (event.messageStatusByte <= midiMessageTypes.sequenceSpecific) {
                // this is a meta-message
                // syntax is FF<type><length><data>
                messageData = [
                    0xff,
                    event.messageStatusByte,
                    ...writeVariableLengthQuantity(event.messageData.length),
                    ...event.messageData
                ];
                // RP-001:
                // Sysex events and meta-events cancel any running status which was in effect.
                runningByte = undefined;
            } else if (
                event.messageStatusByte === midiMessageTypes.systemExclusive
            ) {
                // this is a system exclusive message
                // syntax is F0<length><data>
                messageData = [
                    0xf0,
                    ...writeVariableLengthQuantity(event.messageData.length),
                    ...event.messageData
                ];
                // RP-001:
                // Sysex events and meta-events cancel any running status which was in effect.
                runningByte = undefined;
            } else {
                // this is a midi message
                messageData = [];
                if (runningByte !== event.messageStatusByte) {
                    // Running byte was not the byte we want. Add the byte here.
                    runningByte = event.messageStatusByte;
                    // add the status byte to the midi
                    messageData.push(event.messageStatusByte);
                }
                // add the data
                messageData.push(...event.messageData);
            }
            // write VLQ
            binaryTrack.push(...writeVariableLengthQuantity(deltaTicks));
            // write the message
            binaryTrack.push(...messageData);
            currentTick += deltaTicks;
        }
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
    binaryData.push(...writeBytesAsUintBigEndian(midi.tracksAmount, 2)); // num tracks
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
