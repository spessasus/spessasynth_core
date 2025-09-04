import type { IndexedByteArray } from "../indexed_array";

/**
 * Reads VLQ from a MIDI byte array.
 * @param MIDIbyteArray the array to read from.
 * @returns the number.
 */
export function readVariableLengthQuantity(
    MIDIbyteArray: IndexedByteArray
): number {
    let out = 0;
    while (MIDIbyteArray) {
        const byte = MIDIbyteArray[MIDIbyteArray.currentIndex++];
        // Extract the first 7 bytes
        out = (out << 7) | (byte & 127);

        // If the last byte isn't 1, stop reading
        if (byte >> 7 !== 1) {
            break;
        }
    }
    return out;
}

/**
 * Writes a VLQ from a number to a byte array.
 * @param number the number to write.
 * @returns the VLQ representation of the number.
 */
export function writeVariableLengthQuantity(number: number): number[] {
    // Add the first byte
    const bytes = [number & 127];
    number >>= 7;

    // Continue processing the remaining bytes
    while (number > 0) {
        bytes.unshift((number & 127) | 128);
        number >>= 7;
    }
    return bytes;
}
