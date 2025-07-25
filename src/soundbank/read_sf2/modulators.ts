import { readLittleEndian, signedInt16 } from "../../utils/byte_functions/little_endian.js";
import { DecodedModulator, Modulator } from "../basic_soundbank/modulator.js";

/**
 * Reads the modulator read
 * @param modulatorChunk {RiffChunk}
 * @returns {Modulator[]}
 */
export function readModulators(modulatorChunk) {
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
                destination,
                amount,
                transformType
            )
        );
    }
    // remove terminal
    mods.pop();
    return mods;
}
