import { readLittleEndian } from "../../utils/byte_functions/little_endian.js";

/**
 *
 * @param zonesChunk {RiffChunk} both pbag and ibag work
 * @returns {{mod: number[], gen: number[]}}
 */
export function readZoneIndexes(zonesChunk)
{
    /**
     * @type {number[]}
     */
    const modStartIndexes = [];
    /**
     * @type {number[]}
     */
    const genStartIndexes = [];
    
    while (zonesChunk.chunkData.length > zonesChunk.chunkData.currentIndex)
    {
        genStartIndexes.push(readLittleEndian(zonesChunk.chunkData, 2));
        modStartIndexes.push(readLittleEndian(zonesChunk.chunkData, 2));
    }
    return {
        mod: modStartIndexes,
        gen: genStartIndexes
    };
}