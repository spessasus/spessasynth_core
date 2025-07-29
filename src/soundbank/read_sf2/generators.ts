import { IndexedByteArray } from "../../utils/indexed_array";
import { RIFFChunk } from "../basic_soundbank/riff_chunk";
import { signedInt16 } from "../../utils/byte_functions/little_endian";
import { Generator } from "../basic_soundbank/generator";
import type { GeneratorType } from "../basic_soundbank/generator_types";

export class ReadGenerator extends Generator {
    /**
     * Creates a generator
     */
    constructor(dataArray: IndexedByteArray) {
        super();
        // 4 bytes:
        // type, type, type, value
        const i = dataArray.currentIndex;
        this.generatorType = ((dataArray[i + 1] << 8) |
            dataArray[i]) as GeneratorType;
        this.generatorValue = signedInt16(dataArray[i + 2], dataArray[i + 3]);
        dataArray.currentIndex += 4;
    }
}

/**
 * Reads the generators
 */
export function readGenerators(generatorChunk: RIFFChunk): Generator[] {
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
