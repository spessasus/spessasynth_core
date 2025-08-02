import { IndexedByteArray } from "./indexed_array";
import { readLittleEndianIndexed, writeDword } from "./byte_functions/little_endian";
import { readBinaryString, readBinaryStringIndexed, writeBinaryStringIndexed } from "./byte_functions/string";

/**
 * Riff_chunk.ts
 * reads a riff chunk and stores it as a class
 */

export class RIFFChunk {
    /**
     * The chunks FourCC code.
     */
    public readonly header: string;

    /**
     * Chunk's size, in bytes.
     */
    public readonly size: number;

    /**
     * Chunk's binary data. Note that this will have a length of 0 if "readData" was set to false.
     */
    public readonly data: IndexedByteArray;

    /**
     * Creates a new RIFF chunk.
     */
    public constructor(header: string, size: number, data: IndexedByteArray) {
        this.header = header;
        this.size = size;
        this.data = data;
    }
}

export function readRIFFChunk(
    dataArray: IndexedByteArray,
    readData = true,
    forceShift = false
): RIFFChunk {
    const header = readBinaryStringIndexed(dataArray, 4);

    let size = readLittleEndianIndexed(dataArray, 4);
    if (header === "") {
        // Safeguard against evil DLS files
        // The test case: CrysDLS v1.23.dls
        // https://github.com/spessasus/spessasynth_core/issues/5
        size = 0;
    }
    let chunkData: IndexedByteArray;
    if (readData) {
        chunkData = dataArray.slice(
            dataArray.currentIndex,
            dataArray.currentIndex + size
        );
    } else {
        chunkData = new IndexedByteArray(0);
    }
    if (readData || forceShift) {
        dataArray.currentIndex += size;
    }

    if (size % 2 !== 0) {
        dataArray.currentIndex++;
    }

    return new RIFFChunk(header, size, chunkData);
}

/**
 * Writes a RIFF chunk correctly
 * @param header fourCC
 * @param data chunk data
 * @param addZeroByte add a zero byte into the chunk size
 * @param isList adds "LIST" as the chunk type and writes the actual type at the start of the data
 * @returns the binary data
 */
export function writeRIFFChunkRaw(
    header: string,
    data: Uint8Array,
    addZeroByte = false,
    isList = false
): IndexedByteArray {
    let dataStartOffset = 8;
    let headerWritten = header;
    let dataLength = data.length;
    if (addZeroByte) {
        dataLength++;
    }
    let writtenSize = dataLength;
    if (isList) {
        // Written header is LIST and the passed header is the first 4 bytes of chunk data
        dataStartOffset += 4;
        writtenSize += 4;
        headerWritten = "LIST";
    }
    let finalSize = dataStartOffset + dataLength;
    if (finalSize % 2 !== 0) {
        // Pad byte does not get included in the size
        finalSize++;
    }

    const outArray = new IndexedByteArray(finalSize);
    // FourCC ("RIFF", "LIST", "pdta" etc.)
    writeBinaryStringIndexed(outArray, headerWritten);
    // Chunk size
    writeDword(outArray, writtenSize);
    if (isList) {
        // List type (e.g. "INFO")
        writeBinaryStringIndexed(outArray, header);
    }
    outArray.set(data, dataStartOffset);
    return outArray;
}

/**
 * Writes RIFF chunk given binary blobs
 * @param header fourCC
 * @param chunks chunk data parts, it will be combined in order
 * @param isList adds "LIST" as the chunk type and writes the actual type at the start of the data
 * @returns the binary data
 */
export function writeRIFFChunkParts(
    header: string,
    chunks: Uint8Array[],
    isList = false
): IndexedByteArray {
    let dataOffset = 8;
    let headerWritten = header;
    const dataLength = chunks.reduce((len, c) => c.length + len, 0);
    let writtenSize = dataLength;
    if (isList) {
        // Written header is LIST and the passed header is the first 4 bytes of chunk data
        dataOffset += 4;
        writtenSize += 4;
        headerWritten = "LIST";
    }
    let finalSize = dataOffset + dataLength;
    if (finalSize % 2 !== 0) {
        // Pad byte does not get included in the size
        finalSize++;
    }

    const outArray = new IndexedByteArray(finalSize);
    // FourCC ("RIFF", "LIST", "pdta" etc.)
    writeBinaryStringIndexed(outArray, headerWritten);
    // Chunk size
    writeDword(outArray, writtenSize);
    if (isList) {
        // List type (e.g. "INFO")
        writeBinaryStringIndexed(outArray, header);
    }
    chunks.forEach((c) => {
        outArray.set(c, dataOffset);
        dataOffset += c.length;
    });
    return outArray;
}

/**
 * Finds a given type in a list
 */
export function findRIFFListType(
    collection: RIFFChunk[],
    type: string
): RIFFChunk | undefined {
    return collection.find((c) => {
        if (c.header !== "LIST") {
            return false;
        }
        return readBinaryString(c.data, 4) === type;
    });
}
