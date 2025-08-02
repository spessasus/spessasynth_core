import { readLittleEndian, signedInt16 } from "../../utils/byte_functions/little_endian";
import { DecodedModulator, Modulator } from "../basic_soundbank/modulator";
import type { RIFFChunk } from "../basic_soundbank/riff_chunk";
import type { GeneratorType } from "../basic_soundbank/generator_types";

/**
 * Reads the modulator read
 */
export function readModulators(modulatorChunk: RIFFChunk): Modulator[] {
    const mods = [];
    while (
        modulatorChunk.chunkData.length > modulatorChunk.chunkData.currentIndex
    ) {
        const dataArray = modulatorChunk.chunkData;
        const sourceEnum = readLittleEndian(dataArray, 2);
        const destination = readLittleEndian(dataArray, 2);
        const amount = signedInt16(
            dataArray[dataArray.currentIndex++],
            dataArray[dataArray.currentIndex++]
        );
        const secondarySourceEnum = readLittleEndian(dataArray, 2);
        const transformType = readLittleEndian(dataArray, 2);
        mods.push(
            new DecodedModulator(
                sourceEnum,
                secondarySourceEnum,
                destination as GeneratorType,
                amount,
                transformType
            )
        );
    }
    // Remove terminal
    mods.pop();
    return mods;
}
