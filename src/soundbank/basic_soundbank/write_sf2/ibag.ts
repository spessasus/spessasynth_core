import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeWord } from "../../../utils/byte_functions/little_endian.js";
import { writeRIFFChunkRaw } from "../riff_chunk.js";

const BAG_SIZE = 4;

/**
 * @this {BasicSoundBank}
 * @returns {ReturnedExtendedSf2Chunks}
 */
export function getIBAG()
{
    // write all ibag with their start indexes as they were changed in getIGEN() and getIMOD()
    const ibagSize = this.instruments.reduce(
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
    /**
     * @param z {BasicZone}
     */
    const writeZone = z =>
    {
        // bottom WORD: regular ibag
        writeWord(ibagData, generatorIndex & 0xFFFF);
        writeWord(ibagData, modulatorIndex & 0xFFFF);
        // top WORD: extended ibag
        writeWord(xibagData, generatorIndex >> 16);
        writeWord(xibagData, modulatorIndex >> 16);
        generatorIndex += z.generators.length;
        modulatorIndex += z.modulators.length;
    };
    
    for (const inst of this.instruments)
    {
        writeZone(inst.globalZone);
        for (const ibag of inst.instrumentZones)
        {
            writeZone(ibag);
        }
    }
    // write the terminal IBAG
    writeWord(ibagData, generatorIndex & 0xFFFF);
    writeWord(ibagData, modulatorIndex & 0xFFFF);
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