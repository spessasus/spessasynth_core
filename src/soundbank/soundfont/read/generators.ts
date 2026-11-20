import { IndexedByteArray } from "../../../utils/indexed_array";
import { RIFFChunk } from "../../../utils/riff_chunk";
import { signedInt16 } from "../../../utils/byte_functions/little_endian";
import { Generator } from "../../basic_soundbank/generator";
import {
    type GeneratorType,
    GeneratorTypes,
    MAX_GENERATOR
} from "../../basic_soundbank/generator_types";
import { fromSF2Attenuation } from "../sf2_compatibility";

/**
 * The full index of a zone's instrument or sample: the MSB generator holds the top 16 bits (SFe 4.0, section 7.1.1).
 * Both are read unsigned.
 * @param generators The generators of the zone as the file stores them, unknown ones included.
 * @param index The instrument or sampleID generator.
 * @param msb The matching MSB generator type.
 */
export function readZoneIndex(
    generators: readonly Generator[],
    index: Generator,
    msb: GeneratorType
) {
    // The MSB only counts right before the generator it extends, as the file stores them
    const before = generators[generators.indexOf(index) - 1];
    const top = before?.type === msb ? before.value : 0;
    return (top & 0xff_ff) * 65_536 + (index.value & 0xff_ff);
}

/**
 * The generators a zone keeps: unknown ones (above the last defined generator) are ignored.
 * @param generators The generators of the zone, as read.
 */
export function knownGenerators(generators: readonly Generator[]) {
    return generators.filter((g) => g.type <= MAX_GENERATOR);
}

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
 * @param allowSFeGenerators if generators above endOper are allowed (SFe banks).
 * In any other file the initial attenuation is converted from the SF2 unit.
 */
export function readGenerators(
    generatorChunk: RIFFChunk,
    allowSFeGenerators: boolean
) {
    const gens = new Array<Generator>();
    while (generatorChunk.data.length > generatorChunk.data.currentIndex) {
        const gen = new ReadGenerator(generatorChunk.data);
        // SF2 2.04 section 8.1.2: unknown generators are ignored
        // They are kept in the list as invalid since the zones index into it
        if (!allowSFeGenerators && gen.type > GeneratorTypes.endOper)
            gen.type = GeneratorTypes.invalid;
        // The bank holds true centibels, an SF2 file stores the EMU8000 attenuation
        if (
            !allowSFeGenerators &&
            gen.type === GeneratorTypes.initialAttenuation
        )
            gen.value = fromSF2Attenuation(gen.value);
        gens.push(gen);
    }
    // Remove terminal
    gens.pop();
    return gens;
}
