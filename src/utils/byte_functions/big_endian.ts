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
