import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeWord } from "../../../utils/byte_functions/little_endian.js";
import { RiffChunk, writeRIFFChunk } from "../riff_chunk.js";

/**
 * @this {BasicSoundBank}
 * @returns {IndexedByteArray}
 */
export function getPBAG()
{
    // write all pbag with their start indexes as they were changed in getPGEN() and getPMOD()
    const pbagsize = this.presets.reduce((sum, i) => i.presetZones.length * 4 + sum, 4);
    const pbagdata = new IndexedByteArray(pbagsize);
    let zoneID = 0;
    let generatorIndex = 0;
    let modulatorIndex = 0;
    for (const preset of this.presets)
    {
        // ensure that the first zone is global
        const zones = preset.presetZones.filter(z => !z.isGlobal);
        const global = preset.presetZones.filter(z => z.isGlobal);
        // only take the first one
        if (global?.[0])
        {
            zones.unshift(global?.[0]);
        }
        preset.presetZoneStartIndex = zoneID;
        for (const pbag of zones)
        {
            pbag.zoneID = zoneID;
            writeWord(pbagdata, generatorIndex);
            writeWord(pbagdata, modulatorIndex);
            generatorIndex += pbag.generators.length;
            modulatorIndex += pbag.modulators.length;
            zoneID++;
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