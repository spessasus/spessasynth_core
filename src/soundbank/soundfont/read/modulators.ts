import {
    readLittleEndianIndexed,
    signedInt16
} from "../../../utils/byte_functions/little_endian";
import { DecodedModulator, Modulator } from "../../basic_soundbank/modulator";
import type { RIFFChunk } from "../../../utils/riff_chunk";
import type { GeneratorType } from "../../basic_soundbank/generator_types";

/**
 * Reads the modulator read
 */
export function readModulators(modulatorChunk: RIFFChunk): Modulator[] {
    const mods = [];
    while (modulatorChunk.data.length > modulatorChunk.data.currentIndex) {
        const dataArray = modulatorChunk.data;
        const sourceEnum = readLittleEndianIndexed(dataArray, 2);
        const destination = readLittleEndianIndexed(dataArray, 2);
        const amount = signedInt16(
            dataArray[dataArray.currentIndex++],
            dataArray[dataArray.currentIndex++]
        );
        const secondarySourceEnum = readLittleEndianIndexed(dataArray, 2);
        const transformType = readLittleEndianIndexed(dataArray, 2);
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
