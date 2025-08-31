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
    public channel = 1;

    /**
     * Specifies the 0 based index of the cue entry in the wave pool table.
     */
    public tableIndex: number;

    /**
     * Specifies flag options for this wave link. All bits not defined must be set to 0.
     */
    public fusOptions = 0;

    /**
     * Specifies a group number for samples which are phase locked. All waves in a set of wave
     * links with the same group are phase locked and follow the wave in the group with the
     * F_WAVELINK_PHASE_MASTER flag set. If a wave is not a member of a phase locked
     * group, this value should be set to 0.
     */
    public phaseGroup = 0;

    public constructor(tableIndex: number) {
        this.tableIndex = tableIndex;
    }

    public static read(chunk: RIFFChunk) {
        // Flags
        const fusOptions = readLittleEndianIndexed(chunk.data, 2);
        // Phase group
        const phaseGroup = readLittleEndianIndexed(chunk.data, 2);
        // Channel
        const ulChannel = readLittleEndianIndexed(chunk.data, 4);
        // Table index
        const ulTableIndex = readLittleEndianIndexed(chunk.data, 4);
        const wlnk = new WaveLink(ulTableIndex);
        wlnk.channel = ulChannel;
        wlnk.fusOptions = fusOptions;
        wlnk.phaseGroup = phaseGroup;
        return wlnk;
    }

    public write() {
        const wlnkData = new IndexedByteArray(12);
        writeWord(wlnkData, this.fusOptions); // FusOptions
        writeWord(wlnkData, this.phaseGroup); // UsPhaseGroup
        writeDword(wlnkData, this.channel); // UlChannel
        writeDword(wlnkData, this.tableIndex); // UlTableIndex
        return writeRIFFChunkRaw("wlnk", wlnkData);
    }
}
