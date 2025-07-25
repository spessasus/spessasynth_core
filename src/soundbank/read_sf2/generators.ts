import { IndexedByteArray } from "../../utils/indexed_array.js";
import { RiffChunk } from "../basic_soundbank/riff_chunk.js";
import { signedInt16 } from "../../utils/byte_functions/little_endian.js";
import { Generator } from "../basic_soundbank/generator.js";

export class ReadGenerator extends Generator {
    /**
     * Creates a generator
     * @param dataArray {IndexedByteArray}
     */
    constructor(dataArray) {
        super();
        // 4 bytes:
        // type, type, type, value
        const i = dataArray.currentIndex;
        /**
         * @type {generatorTypes|number}
         */
        this.generatorType = (dataArray[i + 1] << 8) | dataArray[i];
        this.generatorValue = signedInt16(dataArray[i + 2], dataArray[i + 3]);
        dataArray.currentIndex += 4;
    }
}

/**
 * Reads the generator read
 * @param generatorChunk {RiffChunk}
 * @returns {Generator[]}
 */
export function readGenerators(generatorChunk) {
    const gens = [];
    while (
        generatorChunk.chunkData.length > generatorChunk.chunkData.currentIndex
    ) {
        gens.push(new ReadGenerator(generatorChunk.chunkData));
    }
    // remove terminal
    gens.pop();
    return gens;
}
