import { IndexedByteArray } from "./indexed_array";
import {
    readLE64Indexed,
    readLittleEndianIndexed,
    writeDword,
    writeQword
} from "./byte_functions/little_endian";
import {
    getStringBytes,
    readBinaryString,
    readBinaryStringIndexed,
    writeBinaryStringIndexed
} from "./byte_functions/string";
import type {
    DLSChunkFourCC,
    DLSInfoFourCC,
    SF2ChunkFourCC,
    SF2InfoFourCC,
    SoundBankInfoFourCC
} from "../soundbank/types";

import type { RMIDInfoFourCC } from "../midi/types";

export type GenericRIFFFourCC = "RIFF" | "RIFS" | "LIST" | "INFO";
export type WAVFourCC = "wave" | "cue " | "fmt ";
export type FourCC =
    | GenericRIFFFourCC
    | SoundBankInfoFourCC
    | SF2InfoFourCC
    | SF2ChunkFourCC
    | DLSInfoFourCC
    | DLSChunkFourCC
    | RMIDInfoFourCC
    | WAVFourCC;

/**
 * Riff_chunk.ts
 * reads a riff chunk and stores it as a class
 */

export class RIFFChunk {
    /**
     * The chunks FourCC code.
     */
    public readonly header: FourCC;

    /**
     * Chunk's size, in bytes.
     */
    public readonly size: number;

    /**
     * Chunk's binary data. Note that this will have a length of 0 if "readData" was set to false.
     */
    public readonly data: IndexedByteArray;

    /**
     * The size of the chunk's header in bytes.
     * This varies for 32-bit and 64-bit RIFF chunks.
     */
    public readonly headerSize: number;

    /**
     * Creates a new RIFF chunk.
     */
    public constructor(
        header: FourCC,
        size: number,
        data: IndexedByteArray,
        headerSize = 8
    ) {
        this.header = header;
        this.size = size;
        this.data = data;
        this.headerSize = headerSize;
    }

    /**
     * Reads a RIFF chunk from an array.
     * @param dataArray the array to read from.
     * @param rf64 if the chunk uses a 64-bit size.
     * @param readData if the data should be read as well.
     */
    public static read(
        dataArray: IndexedByteArray,
        rf64 = false,
        readData = true
    ): RIFFChunk {
        const header = readBinaryStringIndexed(dataArray, 4) as FourCC;

        let size = rf64
            ? readLE64Indexed(dataArray, 8)
            : readLittleEndianIndexed(dataArray, 4);
        // @ts-expect-error Not all RIFF files are compliant
        if (header === "") {
            // Safeguard against evil DLS files
            // The test case: CrysDLS v1.23.dls
            // https://github.com/spessasus/spessasynth_core/issues/5
            size = 0;
        }
        const chunkData = readData
            ? dataArray.slice(
                  dataArray.currentIndex,
                  dataArray.currentIndex + size
              )
            : new IndexedByteArray(0);
        if (readData) {
            dataArray.currentIndex += size;
            if (size % 2 !== 0) {
                dataArray.currentIndex++;
            }
        }

        return new RIFFChunk(header, size, chunkData, rf64 ? 12 : 8);
    }

    /**
     * Writes a RIFF chunk correctly.
     * @param header the fourCC code of the header.
     * @param data the binary chunk data.
     * @param isList if a "LIST" should be set as the chunk type and the actual type should be written at the start of the data.
     * @param rf64 if the chunk uses a 64-bit size.
     * @returns the binary data.
     */
    public static write(
        header: FourCC,
        data: Uint8Array,
        rf64 = false,
        isList = false
    ): IndexedByteArray {
        if (header.length !== 4) {
            throw new Error(`Invalid header length: ${header}`);
        }
        // FourCC + 8 bytes for 64-bit size
        let dataStartOffset = rf64 ? 12 : 8;
        let headerWritten = header;
        const dataLength = data.length;
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
        if (rf64) writeQword(outArray, writtenSize);
        else writeDword(outArray, writtenSize);

        if (isList) {
            // List type (e.g. "INFO")
            writeBinaryStringIndexed(outArray, header);
        }
        outArray.set(data, dataStartOffset);
        return outArray;
    }

    /**
     * "Writes" a RIFF chunk as a list of binary blobs,
     * which can be appended to a list without using more memory,
     * then finally allocated at the end with `writeParts`.
     * This allows avoiding large array allocations and only one writeParts call at the end.
     * @param header  the fourCC code of the header.
     * @param chunks binary chunk data parts, will be combined in order.
     * @param isList if a "LIST" should be set as the chunk type and the actual type should be written at the start of the data.
     * @param rf64 if the chunk uses a 64-bit size.
     * @returns the chunk as binary blobs.
     */
    public static getParts(
        header: FourCC,
        chunks: Uint8Array[],
        rf64 = false,
        isList = false
    ) {
        let headerWritten = header;
        let totalSize = chunks.reduce((len, c) => c.length + len, 0);
        if (isList) {
            // Written header is LIST and the passed header is the first 4 bytes of chunk data
            totalSize += 4;
            headerWritten = "LIST";
        }
        let sizeBytes: IndexedByteArray;
        if (rf64) {
            sizeBytes = new IndexedByteArray(8);
            writeQword(sizeBytes, totalSize);
        } else {
            sizeBytes = new IndexedByteArray(4);
            writeDword(sizeBytes, totalSize);
        }
        // Header (LIST or actual header), then size
        const parts: Uint8Array[] = [getStringBytes(headerWritten), sizeBytes];

        // If LIST, the actual chunk "type" is at the beginning of data
        if (isList) parts.push(getStringBytes(header));
        // Data
        parts.push(...chunks);

        // Pad byte, does not get included in the size
        if (totalSize % 2 !== 0) parts.push(new Uint8Array(1));

        return parts;
    }

    /**
     * Writes RIFF chunk given binary blobs.
     * It merges them together into data and allocates one large array.
     * @param header  the fourCC code of the header.
     * @param chunks binary chunk data parts, will be combined in order.
     * @param isList if a "LIST" should be set as the chunk type and the actual type should be written at the start of the data.
     * @param rf64 if the chunk uses a 64-bit size.
     * @returns the binary data.
     */
    public static writeParts(
        header: FourCC,
        chunks: (Uint8Array | number[])[],
        rf64 = false,
        isList = false
    ): IndexedByteArray {
        // FourCC + 8 bytes for 64-bit size
        let dataOffset = rf64 ? 12 : 8;
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
        if (rf64) writeQword(outArray, writtenSize);
        else writeDword(outArray, writtenSize);

        if (isList) {
            // List type (e.g. "INFO")
            writeBinaryStringIndexed(outArray, header);
        }
        for (const c of chunks) {
            outArray.set(c, dataOffset);
            dataOffset += c.length;
        }
        return outArray;
    }

    /**
     * Finds a given type in a list.
     * @remarks
     * Also skips the current index to after the list FourCC.
     */
    public static findListType(
        collection: RIFFChunk[],
        type: FourCC
    ): RIFFChunk | undefined {
        return collection.find((c) => {
            if (c.header !== "LIST") {
                return false;
            }
            c.data.currentIndex = 4;
            return readBinaryString(c.data, 4) === type;
        });
    }
}
