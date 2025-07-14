import { IndexedByteArray } from "../indexed_array.js";

/**
 * @param dataArray {IndexedByteArray}
 * @param bytes {number}
 * @param trimEnd {boolean} if we should trim once we reach an invalid byte
 * @returns {string}
 */
export function readBytesAsString(dataArray, bytes, trimEnd = true)
{
    let finished = false;
    let string = "";
    for (let i = 0; i < bytes; i++)
    {
        let byte = dataArray[dataArray.currentIndex++];
        if (finished)
        {
            continue;
        }
        if ((byte < 32 || byte > 127) && byte !== 10) // 10 is "\n"
        {
            if (trimEnd)
            {
                finished = true;
                continue;
            }
            else
            {
                if (byte === 0)
                {
                    finished = true;
                    continue;
                }
            }
        }
        string += String.fromCharCode(byte);
    }
    return string;
}

/**
 * @param string {string}
 * @param addZero {boolean} adds a zero terminator at the end
 * @param ensureEven {boolean} ensures even byte count
 * @returns {IndexedByteArray}
 */
export function getStringBytes(string, addZero = false, ensureEven = false)
{
    let len = string.length;
    if (addZero)
    {
        len++;
    }
    if (ensureEven && len % 2 !== 0)
    {
        len++;
    }
    const arr = new IndexedByteArray(len);
    writeStringAsBytes(arr, string);
    return arr;
}

/**
 * @param string {string}
 * @param outArray {IndexedByteArray}
 * @param padLength {number}
 * @returns {IndexedByteArray} modified IN PLACE
 */
export function writeStringAsBytes(outArray, string, padLength = 0)
{
    if (padLength > 0)
    {
        if (string.length > padLength)
        {
            string = string.slice(0, padLength);
        }
    }
    for (let i = 0; i < string.length; i++)
    {
        outArray[outArray.currentIndex++] = string.charCodeAt(i);
    }
    
    // pad with zeros if needed
    if (padLength > string.length)
    {
        for (let i = 0; i < padLength - string.length; i++)
        {
            outArray[outArray.currentIndex++] = 0;
        }
    }
    return outArray;
}