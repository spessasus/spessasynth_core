import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeLittleEndian, writeWord } from "../../../utils/byte_functions/little_endian.js";
import { writeRIFFChunkRaw } from "../riff_chunk.js";
import { MOD_BYTE_SIZE } from "../modulator.js";

/**
 * @this {BasicSoundBank}
 * @returns {ReturnedExtendedSf2Chunks}
 */
export function getPMOD()
{
    // very similar to imod,
    // go through all presets -> zones and write modulators sequentially
    let pmodSize = MOD_BYTE_SIZE;
    for (const preset of this.presets)
    {
        pmodSize += preset.globalZone.modulators.length * MOD_BYTE_SIZE;
        pmodSize += preset.presetZones.reduce((sum, z) => z.modulators.length * MOD_BYTE_SIZE + sum, 0);
    }
    const pmodData = new IndexedByteArray(pmodSize);
    
    /**
     * @param z {BasicZone}
     */
    const writeZone = z =>
    {
        for (const mod of z.modulators)
        {
            writeWord(pmodData, mod.getSourceEnum());
            writeWord(pmodData, mod.modulatorDestination);
            writeWord(pmodData, mod.transformAmount);
            writeWord(pmodData, mod.getSecSrcEnum());
            writeWord(pmodData, mod.transformType);
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
    writeLittleEndian(pmodData, 0, MOD_BYTE_SIZE);
    
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const xpmodData = new IndexedByteArray(MOD_BYTE_SIZE);
    writeLittleEndian(xpmodData, 0, MOD_BYTE_SIZE);
    
    const pmod = writeRIFFChunkRaw("pmod", pmodData);
    const xpmod = writeRIFFChunkRaw("pmod", xpmodData);
    return {
        pdta: pmod,
        xdta: xpmod,
        highestIndex: 0 // not applicable
    };
}