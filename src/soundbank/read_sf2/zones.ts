import { readLittleEndian } from "../../utils/byte_functions/little_endian";
import type { RiffChunk } from "../basic_soundbank/riff_chunk";

/**
 * @param zonesChunk both pbag and ibag work
 */
export function readZoneIndexes(zonesChunk: RiffChunk): {
    mod: number[];
    gen: number[];
} {
    const modStartIndexes: number[] = [];
    const genStartIndexes: number[] = [];

    while (zonesChunk.chunkData.length > zonesChunk.chunkData.currentIndex) {
        genStartIndexes.push(readLittleEndian(zonesChunk.chunkData, 2));
        modStartIndexes.push(readLittleEndian(zonesChunk.chunkData, 2));
    }
    return {
        mod: modStartIndexes,
        gen: genStartIndexes
    };
}
