import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeWord } from "../../../utils/byte_functions/little_endian.js";
import { RiffChunk, writeRIFFChunk } from "../riff_chunk.js";

const BAG_SIZE = 4;

/**
 * @this {BasicSoundBank}
 * @returns {ReturnedExtendedSf2Chunks}
 */
export function getPBAG()
{
    // write all pbag with their start indexes as they were changed in getPGEN() and getPMOD()
    const pbagSize = this.presets.reduce((sum, i) =>
        // +1 because global zone
        (i.presetZones.length + 1) * BAG_SIZE + sum, BAG_SIZE);
    const pbagData = new IndexedByteArray(pbagSize);
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const xpbagData = new IndexedByteArray(pbagSize);
    let generatorIndex = 0;
    let modulatorIndex = 0;
    
    /**
     * @param z {BasicZone}
     */
    const writeZone = z =>
    {
        writeWord(pbagData, generatorIndex & 0xFFFF);
        writeWord(pbagData, modulatorIndex & 0xFFFF);
        writeWord(xpbagData, generatorIndex >> 16);
        writeWord(xpbagData, modulatorIndex >> 16);
        generatorIndex += z.generators.length;
        modulatorIndex += z.modulators.length;
    };
    
    for (const preset of this.presets)
    {
        // global
        writeZone(preset.globalZone);
        for (const pbag of preset.presetZones)
        {
            writeZone(pbag);
        }
    }
    // write the terminal PBAG
    writeWord(pbagData, generatorIndex);
    writeWord(pbagData, modulatorIndex);
    writeWord(xpbagData, generatorIndex);
    writeWord(xpbagData, modulatorIndex);
    const pbag = writeRIFFChunk(new RiffChunk(
        "pbag",
        pbagData.length,
        pbagData
    ));
    const xbag = writeRIFFChunk(new RiffChunk(
        "pbag",
        xpbagData.length,
        xpbagData
    ));
    return {
        pdta: pbag,
        xdta: xbag,
        highestIndex: Math.max(generatorIndex, modulatorIndex)
    };
}