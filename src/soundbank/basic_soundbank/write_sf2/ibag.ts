import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeWord } from "../../../utils/byte_functions/little_endian.js";
import { writeRIFFChunkRaw } from "../riff_chunk.js";
import type { BasicSoundBank } from "../basic_soundbank.ts";
import type { ReturnedExtendedSf2Chunks } from "../../types.ts";
import type { BasicZone } from "../basic_zone.ts";

const BAG_SIZE = 4;

export function getIBAG(bank: BasicSoundBank): ReturnedExtendedSf2Chunks {
    // write all ibag with their start indexes as they were changed in getIGEN() and getIMOD()
    const ibagSize = bank.instruments.reduce(
        (sum, i) =>
            // +1 because global zone
            (i.instrumentZones.length + 1) * BAG_SIZE + sum,
        BAG_SIZE
    );
    const ibagData = new IndexedByteArray(ibagSize);
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const xibagData = new IndexedByteArray(ibagSize);
    let generatorIndex = 0;
    let modulatorIndex = 0;
    const writeZone = (z: BasicZone) => {
        // bottom WORD: regular ibag
        writeWord(ibagData, generatorIndex & 0xffff);
        writeWord(ibagData, modulatorIndex & 0xffff);
        // top WORD: extended ibag
        writeWord(xibagData, generatorIndex >> 16);
        writeWord(xibagData, modulatorIndex >> 16);
        generatorIndex += z.generators.length;
        modulatorIndex += z.modulators.length;
    };

    for (const inst of bank.instruments) {
        writeZone(inst.globalZone);
        for (const ibag of inst.instrumentZones) {
            writeZone(ibag);
        }
    }
    // write the terminal IBAG
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
