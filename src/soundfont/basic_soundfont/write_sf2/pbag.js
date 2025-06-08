import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeWord } from "../../../utils/byte_functions/little_endian.js";
import { RiffChunk, writeRIFFChunk } from "../riff_chunk.js";

const BAG_SIZE = 4;

/**
 * @this {BasicSoundBank}
 * @returns {IndexedByteArray}
 */
export function getPBAG()
{
    // write all pbag with their start indexes as they were changed in getPGEN() and getPMOD()
    const pbagsize = this.presets.reduce((sum, i) =>
        // +1 because global zone
        (i.presetZones.length + 1) * BAG_SIZE + sum, BAG_SIZE);
    const pbagdata = new IndexedByteArray(pbagsize);
    let generatorIndex = 0;
    let modulatorIndex = 0;
    
    /**
     * @param z {BasicZone}
     */
    const writeZone = z =>
    {
        writeWord(pbagdata, generatorIndex);
        writeWord(pbagdata, modulatorIndex);
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
    writeWord(pbagdata, generatorIndex);
    writeWord(pbagdata, modulatorIndex);
    
    return writeRIFFChunk(new RiffChunk(
        "pbag",
        pbagdata.length,
        pbagdata
    ));
}