import type { IndexedByteArray } from "../indexed_array";

/**
 * Reads number as Big endian.
 * @param dataArray the array to read from.
 * @param bytesAmount the number of bytes to read.
 * @param offset the offset to start reading from.
 * @returns the number.
 */
export function readBigEndian(
    dataArray: number[] | ArrayLike<number>,
    bytesAmount: number,
    offset = 0
) {
    let out = 0;
    for (let i = 0; i < bytesAmount; i++) {
        out = (out << 8) | dataArray[offset + i];
    }
    return out >>> 0;
}

/**
 * Reads number as Big endian from an IndexedByteArray.
 * @param dataArray the array to read from.
 * @param bytesAmount the number of bytes to read.
 * @returns the number.
 */
export function readBigEndianIndexed(
    dataArray: IndexedByteArray,
    bytesAmount: number
) {
    const res = readBigEndian(dataArray, bytesAmount, dataArray.currentIndex);
    dataArray.currentIndex += bytesAmount;
    return res;
}

/**
 * Writes a number as Big endian.
 * @param number the number to write.
 * @param bytesAmount the amount of bytes to use. Excess bytes will be set to zero.
 * @returns the Big endian representation of the number.
 */
export function writeBigEndian(number: number, bytesAmount: number) {
    const bytes = new Array<number>(bytesAmount).fill(0);
    for (let i = bytesAmount - 1; i >= 0; i--) {
        bytes[i] = number & 0xff;
        number >>= 8;
    }

    return bytes;
}
