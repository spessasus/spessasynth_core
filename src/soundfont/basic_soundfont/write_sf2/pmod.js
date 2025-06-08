import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeLittleEndian, writeWord } from "../../../utils/byte_functions/little_endian.js";
import { RiffChunk, writeRIFFChunk } from "../riff_chunk.js";
import { MOD_BYTE_SIZE } from "../modulator.js";

/**
 * @this {BasicSoundBank}
 * @returns {IndexedByteArray}
 */
export function getPMOD()
{
    // very similar to imod,
    // go through all presets -> zones and write modulators sequentially
    let pmodsize = MOD_BYTE_SIZE;
    for (const preset of this.presets)
    {
        pmodsize += preset.globalZone.modulators.length * MOD_BYTE_SIZE;
        pmodsize += preset.presetZones.reduce((sum, z) => z.modulators.length * MOD_BYTE_SIZE + sum, 0);
    }
    const pmoddata = new IndexedByteArray(pmodsize);
    
    /**
     * @param z {BasicZone}
     */
    const writeZone = z =>
    {
        for (const mod of z.modulators)
        {
            writeWord(pmoddata, mod.getSourceEnum());
            writeWord(pmoddata, mod.modulatorDestination);
            writeWord(pmoddata, mod.transformAmount);
            writeWord(pmoddata, mod.getSecSrcEnum());
            writeWord(pmoddata, mod.transformType);
        }
    };
    
    
    for (const preset of this.presets)
    {
        // global
        writeZone(preset.globalZone);
        for (const zone of preset.presetZones)
        {
            writeZone(zone);
        }
    }
    
    // terminal modulator, is zero
    writeLittleEndian(pmoddata, 0, MOD_BYTE_SIZE);
    
    return writeRIFFChunk(new RiffChunk(
        "pmod",
        pmoddata.length,
        pmoddata
    ));
}