import { IndexedByteArray } from "../indexed_array";

/**
 * Reads bytes as an ASCII string. This version works with any numeric array.
 * @param dataArray the array to read from.
 * @param bytes the amount of bytes to read.
 * @param offset the offset in the array to start reading from.
 * @returns the string.
 */
export function readBinaryString(
    dataArray: ArrayLike<number>,
    bytes = dataArray.length,
    offset = 0
) {
    let string = "";
    for (let i = 0; i < bytes; i++) {
        const byte = dataArray[offset + i];
        if (byte === 0) {
            return string;
        }

        string += String.fromCharCode(byte);
    }
    return string;
}

/**
 * Reads bytes as an ASCII string from an IndexedByteArray.
 * @param dataArray the IndexedByteArray to read from.
 * @param bytes the amount of bytes to read.
 * @returns the string.
 */
export function readBinaryStringIndexed(
    dataArray: IndexedByteArray,
    bytes: number
) {
    const startIndex = dataArray.currentIndex;
    dataArray.currentIndex += bytes;
    return readBinaryString(dataArray, bytes, startIndex);
}

/**
 * Gets ASCII bytes from string.
 * @param string the string.
 * @param addZero adds a zero terminator at the end.
 * @param ensureEven ensures even byte count.
 * @returns the binary data.
 */
export function getStringBytes(
    string: string,
    addZero = false,
    ensureEven = false
): IndexedByteArray {
    let len = string.length;
    if (addZero) {
        len++;
    }
    if (ensureEven && len % 2 !== 0) {
        len++;
    }
    const arr = new IndexedByteArray(len);
    writeBinaryStringIndexed(arr, string);
    return arr;
}

/**
 * Writes ASCII bytes into a specified array.
 * @param string the string.
 * @param outArray the target array
 * @param padLength pad with zeros if the string is shorter
 * @returns modified _in-place_
 */
export function writeBinaryStringIndexed(
    outArray: IndexedByteArray,
    string: string,
    padLength = 0
): IndexedByteArray {
    if (padLength > 0) {
        if (string.length > padLength) {
            string = string.slice(0, padLength);
        }
    }
    for (let i = 0; i < string.length; i++) {
        outArray[outArray.currentIndex++] = string.charCodeAt(i);
    }

    // Pad with zeros if needed
    if (padLength > string.length) {
        for (let i = 0; i < padLength - string.length; i++) {
            outArray[outArray.currentIndex++] = 0;
        }
    }
    return outArray;
}
