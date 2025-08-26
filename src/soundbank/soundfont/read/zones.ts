import { readLittleEndianIndexed } from "../../../utils/byte_functions/little_endian";
import type { RIFFChunk } from "../../../utils/riff_chunk";

/**
 * @param zonesChunk both pbag and ibag work
 */
export function readZoneIndexes(zonesChunk: RIFFChunk): {
    mod: number[];
    gen: number[];
} {
    const modStartIndexes: number[] = [];
    const genStartIndexes: number[] = [];

    while (zonesChunk.data.length > zonesChunk.data.currentIndex) {
        genStartIndexes.push(readLittleEndianIndexed(zonesChunk.data, 2));
        modStartIndexes.push(readLittleEndianIndexed(zonesChunk.data, 2));
    }
    return {
        mod: modStartIndexes,
        gen: genStartIndexes
    };
}
