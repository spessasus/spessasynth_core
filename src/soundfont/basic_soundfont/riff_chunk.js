import { IndexedByteArray } from "../../utils/indexed_array.js";
import { readLittleEndian, writeDword } from "../../utils/byte_functions/little_endian.js";
import { readBytesAsString, writeStringAsBytes } from "../../utils/byte_functions/string.js";

/**
 * riff_chunk.js
 * reads a riff chunk and stores it as a class
 */

export class RiffChunk
{
    /**
     * The chunks FourCC code
     * @type {string}
     */
    header;
    
    /**
     * Chunk's size, in bytes
     * @type {number}
     */
    size;
    
    /**
     * Chunk's binary data
     * @type {IndexedByteArray}
     */
    chunkData;
    
    /**
     * Creates a new RIFF chunk
     * @constructor
     * @param header {string}
     * @param size {number}
     * @param data {IndexedByteArray}
     */
    constructor(header, size, data)
    {
        this.header = header;
        this.size = size;
        this.chunkData = data;
    }
    
}

/**
 * @param dataArray {IndexedByteArray}
 * @param readData {boolean}
 * @param forceShift {boolean}
 * @returns {RiffChunk}
 */
export function readRIFFChunk(dataArray, readData = true, forceShift = false)
{
    let header = readBytesAsString(dataArray, 4);
    
    let size = readLittleEndian(dataArray, 4);
    /**
     * @type {IndexedByteArray}
     */
    let chunkData = undefined;
    if (readData)
    {
        chunkData = dataArray.slice(dataArray.currentIndex, dataArray.currentIndex + size);
    }
    if (readData || forceShift)
    {
        dataArray.currentIndex += size;
    }
    
    if (size % 2 !== 0)
    {
        if (dataArray[dataArray.currentIndex] === 0)
        {
            dataArray.currentIndex++;
        }
    }
    
    return new RiffChunk(header, size, chunkData);
}

/**
 * Writes a RIFF chunk correctly
 * @param header {string} fourCC
 * @param data {Uint8Array} chunk data
 * @param addZeroByte {boolean} add a zero byte into the chunk size
 * @param isList {boolean} adds "LIST" as the chunk type and writes the actual type at the start of the data
 * @returns {IndexedByteArray}
 */
export function writeRIFFChunkRaw(header, data, addZeroByte = false, isList = false)
{
    let dataStartOffset = 8;
    let headerWritten = header;
    let dataLength = data.length;
    if (addZeroByte)
    {
        dataLength++;
    }
    let writtenSize = dataLength;
    if (isList)
    {
        // written header is LIST and the passed header is the first 4 bytes of chunk data
        dataStartOffset += 4;
        writtenSize += 4;
        headerWritten = "LIST";
    }
    let finalSize = dataStartOffset + dataLength;
    if (finalSize % 2 !== 0)
    {
        // pad byte does not get included in the size
        finalSize++;
    }
    
    const outArray = new IndexedByteArray(finalSize);
    // FourCC ("RIFF", "LIST", "pdta" etc.)
    writeStringAsBytes(outArray, headerWritten);
    // chunk size
    writeDword(outArray, writtenSize);
    if (isList)
    {
        // list type (e.g. "INFO")
        writeStringAsBytes(outArray, header);
    }
    outArray.set(data, dataStartOffset);
    return outArray;
}

/**
 * Writes RIFF chunk given binary blobs
 * @param header {string} fourCC
 * @param chunks {Uint8Array[]} chunk data parts, it will be combined in order
 * @param isList {boolean} adds "LIST" as the chunk type and writes the actual type at the start of the data
 * @returns {IndexedByteArray}
 */
export function writeRIFFChunkParts(header, chunks, isList = false)
{
    let dataOffset = 8;
    let headerWritten = header;
    let dataLength = chunks.reduce((len, c) => c.length + len, 0);
    let writtenSize = dataLength;
    if (isList)
    {
        // written header is LIST and the passed header is the first 4 bytes of chunk data
        dataOffset += 4;
        writtenSize += 4;
        headerWritten = "LIST";
    }
    let finalSize = dataOffset + dataLength;
    if (finalSize % 2 !== 0)
    {
        // pad byte does not get included in the size
        finalSize++;
    }
    
    const outArray = new IndexedByteArray(finalSize);
    // fourCC ("RIFF", "LIST", "pdta" etc.)
    writeStringAsBytes(outArray, headerWritten);
    // chunk size
    writeDword(outArray, writtenSize);
    if (isList)
    {
        // list type (e.g. "INFO")
        writeStringAsBytes(outArray, header);
    }
    chunks.forEach(c =>
    {
        outArray.set(c, dataOffset);
        dataOffset += c.length;
    });
    return outArray;
}

/**
 * @param collection {RiffChunk[]}
 * @param type {string}
 * @returns {RiffChunk|undefined}
 */
export function findRIFFListType(collection, type)
{
    return collection.find(c =>
    {
        if (c.header !== "LIST")
        {
            return false;
        }
        c.chunkData.currentIndex = 0;
        return readBytesAsString(c.chunkData, 4) === type;
    });
}