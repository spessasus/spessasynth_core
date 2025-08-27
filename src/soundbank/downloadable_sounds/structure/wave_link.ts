import type { DLSChannelType } from "../../enums";
import { type RIFFChunk, writeRIFFChunkRaw } from "../../../utils/riff_chunk";
import {
    readLittleEndianIndexed,
    writeDword,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import { IndexedByteArray } from "../../../utils/indexed_array";

export class WaveLink {
    /**
     * Specifies the channel placement of the sample. This is used to place mono sounds within a
     * stereo pair or for multi-track placement. Each bit position within the ulChannel field specifies
     * a channel placement with bit 0 specifying a mono sample or the left channel of a stereo file.
     */
    public channel: DLSChannelType = 0;

    /**
     * Specifies the 0 based index of the cue entry in the wave pool table.
     */
    public tableIndex: number;

    public constructor(tableIndex: number) {
        this.tableIndex = tableIndex;
    }

    public static read(chunk: RIFFChunk) {
        // Flags
        readLittleEndianIndexed(chunk.data, 2);
        // Phase group
        readLittleEndianIndexed(chunk.data, 2);
        // Channel
        const ulChannel = readLittleEndianIndexed(chunk.data, 4);
        // Table index
        const ulTableIndex = readLittleEndianIndexed(chunk.data, 4);
        const wlnk = new WaveLink(ulTableIndex);
        wlnk.channel = ulChannel;
        return wlnk;
    }

    public write() {
        const wlnkData = new IndexedByteArray(12);
        writeWord(wlnkData, 0); // FusOptions
        writeWord(wlnkData, 0); // UsPhaseGroup
        writeDword(wlnkData, this.channel); // UlChannel
        writeDword(wlnkData, this.tableIndex); // UlTableIndex
        return writeRIFFChunkRaw("wlnk", wlnkData);
    }
}
