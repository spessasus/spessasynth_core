import type { IndexedByteArray } from "../indexed_array";

/**
 * Reads number as Big endian.
 * @param dataArray the array to read from.
 * @param bytesAmount the number of bytes to read.
 * @returns the number.
 */
export function readBytesAsUintBigEndian(
    dataArray: IndexedByteArray,
    bytesAmount: number
): number {
    let out = 0;
    for (let i = 8 * (bytesAmount - 1); i >= 0; i -= 8) {
        out |= dataArray[dataArray.currentIndex++] << i;
    }
    return out >>> 0;
}

/**
 * Writes a number as Big endian.
 * @param number the number to write.
 * @param bytesAmount the amount of bytes to use. Excess bytes will be set to zero.
 * @returns the Big endian representation of the number.
 */
export function writeBytesAsUintBigEndian(
    number: number,
    bytesAmount: number
): number[] {
    const bytes = new Array<number>(bytesAmount).fill(0);
    for (let i = bytesAmount - 1; i >= 0; i--) {
        bytes[i] = number & 0xff;
        number >>= 8;
    }

    return bytes;
}
