import {
    readLittleEndianIndexed,
    signedInt16
} from "../../../utils/byte_functions/little_endian";
import { DecodedModulator, Modulator } from "../../basic_soundbank/modulator";
import type { RIFFChunk } from "../../../utils/riff_chunk";
import {
    type GeneratorType,
    GeneratorTypes
} from "../../basic_soundbank/generator_types";

/**
 * Reads the modulator read
 * @param modulatorChunk pmod, imod or DMOD
 * @param allowSFEGenerators if destinations above endOper are allowed (SFE banks)
 */
export function readModulators(
    modulatorChunk: RIFFChunk,
    allowSFEGenerators: boolean
): Modulator[] {
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
        const mod = new DecodedModulator(
            sourceEnum,
            secondarySourceEnum,
            destination as GeneratorType,
            amount,
            transformType
        );
        if (!allowSFEGenerators && mod.destination > GeneratorTypes.endOper)
            mod.destination = GeneratorTypes.invalid;
        mods.push(mod);
    }
    // Remove terminal
    mods.pop();
    return mods;
}
