import type { IndexedByteArray } from "../indexed_array";

/**
 * The largest value 4 VLQ bytes can hold.
 */
const MAX_VLQ = 0x0f_ff_ff_ff;

/**
 * Reads VLQ from a MIDI byte array.
 * A VLQ longer than 4 bytes (only found in damaged files) is read whole,
 * but its value stops at the 4 byte maximum (0x0FFFFFFF).
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
        // Extract the first 7 bits.
        // A VLQ is at most 4 bytes, a longer one only comes from a damaged file.
        // Its bytes are still read so the next read starts after it, but the value stops at the 4 byte maximum
        // (the shift alone would overflow into negative ticks and lengths).
        out = Math.min(out * 128 + (byte & 127), MAX_VLQ);

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
