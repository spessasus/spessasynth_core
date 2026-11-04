import { IndexedByteArray } from "../../../utils/indexed_array";
import { RIFFChunk } from "../../../utils/riff_chunk";
import { signedInt16 } from "../../../utils/byte_functions/little_endian";
import { Generator } from "../../basic_soundbank/generator";
import {
    type GeneratorType,
    GeneratorTypes
} from "../../basic_soundbank/generator_types";

export class ReadGenerator extends Generator {
    /**
     * Creates a generator
     */
    public constructor(dataArray: IndexedByteArray) {
        // Note: We skip validation here as some sf2 files use invalid values that end up being correct after applying limits at the modulator level.
        // Test case: LiveHQ Natural soundfont GM, "Brass" preset (negative attenuation with quiet samples)
        // 4 bytes:
        // Type, type, value, value
        const i = dataArray.currentIndex;
        const generatorType = ((dataArray[i + 1] << 8) |
            dataArray[i]) as GeneratorType;
        const generatorValue = signedInt16(dataArray[i + 2], dataArray[i + 3]);
        dataArray.currentIndex += 4;
        super(generatorType, generatorValue, false);
    }
}

/**
 * Reads the generators
 * @param generatorChunk pgen or igen
 * @param allowSFEGenerators if generators above endOper are allowed (SFE banks)
 */
export function readGenerators(
    generatorChunk: RIFFChunk,
    allowSFEGenerators: boolean
) {
    const gens = new Array<Generator>();
    while (generatorChunk.data.length > generatorChunk.data.currentIndex) {
        const gen = new ReadGenerator(generatorChunk.data);
        // SF2 2.04 section 8.1.2: unknown generators are ignored
        // They are kept in the list as invalid since the zones index into it
        if (!allowSFEGenerators && gen.type > GeneratorTypes.endOper)
            gen.type = GeneratorTypes.invalid;
        gens.push(gen);
    }
    // Remove terminal
    gens.pop();
    return gens;
}
