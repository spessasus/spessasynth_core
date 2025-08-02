import { IndexedByteArray } from "../../../utils/indexed_array";
import { writeWord } from "../../../utils/byte_functions/little_endian";
import { writeRIFFChunkRaw } from "../riff_chunk";
import type { BasicSoundBank } from "../basic_soundbank";
import type { ReturnedExtendedSf2Chunks } from "../../types";
import type { BasicZone } from "../basic_zone";

const BAG_SIZE = 4;

export function getIBAG(bank: BasicSoundBank): ReturnedExtendedSf2Chunks {
    // Write all ibag with their start indexes as they were changed in getIGEN() and getIMOD()
    const ibagSize = bank.instruments.reduce(
        (sum, i) =>
            // +1 because global zone
            (i.zones.length + 1) * BAG_SIZE + sum,
        BAG_SIZE
    );
    const ibagData = new IndexedByteArray(ibagSize);
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const xibagData = new IndexedByteArray(ibagSize);
    let generatorIndex = 0;
    let modulatorIndex = 0;
    const writeZone = (z: BasicZone) => {
        // Bottom WORD: regular ibag
        writeWord(ibagData, generatorIndex & 0xffff);
        writeWord(ibagData, modulatorIndex & 0xffff);
        // Top WORD: extended ibag
        writeWord(xibagData, generatorIndex >> 16);
        writeWord(xibagData, modulatorIndex >> 16);
        generatorIndex += z.generators.length;
        modulatorIndex += z.modulators.length;
    };

    for (const inst of bank.instruments) {
        writeZone(inst.globalZone);
        for (const ibag of inst.zones) {
            writeZone(ibag);
        }
    }
    // Write the terminal IBAG
    writeWord(ibagData, generatorIndex & 0xffff);
    writeWord(ibagData, modulatorIndex & 0xffff);
    writeWord(xibagData, generatorIndex >> 16);
    writeWord(xibagData, modulatorIndex >> 16);
    const ibag = writeRIFFChunkRaw("ibag", ibagData);
    const xibag = writeRIFFChunkRaw("ibag", xibagData);
    return {
        pdta: ibag,
        xdta: xibag,
        highestIndex: Math.max(generatorIndex, modulatorIndex)
    };
}
