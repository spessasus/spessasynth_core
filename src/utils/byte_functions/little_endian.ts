import type { IndexedByteArray } from "../indexed_array";

/**
 * Reads the number as little endian from an IndexedByteArray.
 * @param dataArray the array to read from.
 * @param bytesAmount the number of bytes to read.
 * @returns the number.
 */
export function readLittleEndianIndexed(
    dataArray: IndexedByteArray,
    bytesAmount: number
): number {
    const res = readLittleEndian(
        dataArray,
        bytesAmount,
        dataArray.currentIndex
    );
    dataArray.currentIndex += bytesAmount;
    return res;
}

/**
 * Reads the number as little endian.
 * @param dataArray the array to read from.
 * @param bytesAmount the number of bytes to read.
 * @param offset the offset to start reading at.
 * @returns the number.
 */
export function readLittleEndian(
    dataArray: number[] | ArrayLike<number>,
    bytesAmount: number,
    offset = 0
) {
    let out = 0;
    for (let i = 0; i < bytesAmount; i++) {
        out |= dataArray[offset + i] << (i * 8);
    }
    // Make sure it stays unsigned
    return out >>> 0;
}

/**
 * Writes a number as little endian seems to also work for negative numbers so yay?
 * @param dataArray the IndexedByteArray to write to.
 * @param number the number to write.
 * @param byteTarget the amount of bytes to use. Excess bytes will be set to zero.
 * @returns the Big endian representation of the number.
 */
export function writeLittleEndianIndexed(
    dataArray: IndexedByteArray,
    number: number,
    byteTarget: number
) {
    for (let i = 0; i < byteTarget; i++) {
        dataArray[dataArray.currentIndex++] = (number >> (i * 8)) & 0xff;
    }
}

/**
 * Writes a WORD (SHORT)
 */
export function writeWord(dataArray: IndexedByteArray, word: number) {
    dataArray[dataArray.currentIndex++] = word & 0xff;
    dataArray[dataArray.currentIndex++] = word >> 8;
}

/**
 * Writes a DWORD (INT)
 */
export function writeDword(dataArray: IndexedByteArray, dword: number) {
    writeLittleEndianIndexed(dataArray, dword, 4);
}

/**
 * Reads two bytes as a signed short.
 */
export function signedInt16(byte1: number, byte2: number): number {
    const val = (byte2 << 8) | byte1;
    if (val > 32_767) {
        return val - 65_536;
    }
    return val;
}

/**
 * Reads a byte as a signed char.
 */
export function signedInt8(byte: number): number {
    if (byte > 127) {
        return byte - 256;
    }
    return byte;
}
