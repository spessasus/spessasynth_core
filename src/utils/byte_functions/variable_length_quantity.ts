import type { IndexedByteArray } from "../indexed_array";

/**
 * The largest value 4 VLQ bytes can hold, the longest a MIDI file allows.
 */
export const MAX_VLQ = 0x0f_ff_ff_ff;

/**
 * Reads VLQ from a MIDI byte array.
 * A long VLQ (more than 4 bytes only appears in damaged MIDI files) is read whole and never turns negative.
 * @param midiByteArray the array to read from.
 * @returns the number.
 * @group Utilities
 */
export function readVariableLengthQuantity(
    midiByteArray: IndexedByteArray
): number {
    let out = 0;
    // Stop at the end of the array even if the last byte has the continuation bit
    while (midiByteArray.currentIndex < midiByteArray.length) {
        const byte = midiByteArray[midiByteArray.currentIndex++];
        // Extract the first 7 bits. Multiplying instead of shifting, a shift overflows past 31 bits into negative numbers
        out = out * 128 + (byte & 127);

        // If the continuation bit isn't set, stop reading
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
