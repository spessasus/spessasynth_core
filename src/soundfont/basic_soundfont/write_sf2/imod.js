import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeLittleEndian, writeWord } from "../../../utils/byte_functions/little_endian.js";
import { RiffChunk, writeRIFFChunk } from "../riff_chunk.js";
import { MOD_BYTE_SIZE } from "../modulator.js";

/**
 * @this {BasicSoundBank}
 * @returns {ReturnedExtendedSf2Chunks}
 */
export function getIMOD()
{
    // very similar to igen,
    // go through all instruments -> zones and write modulators sequentially
    let imodSize = MOD_BYTE_SIZE; // terminal
    for (const inst of this.instruments)
    {
        imodSize += inst.globalZone.modulators.length * MOD_BYTE_SIZE;
        // start with one mod for global
        imodSize += inst.instrumentZones.reduce((sum, z) => z.modulators.length * MOD_BYTE_SIZE + sum, 0);
    }
    const imodData = new IndexedByteArray(imodSize);
    
    /**
     * @param z {BasicZone}
     */
    const writeZone = z =>
    {
        for (const mod of z.modulators)
        {
            writeWord(imodData, mod.getSourceEnum());
            writeWord(imodData, mod.modulatorDestination);
            writeWord(imodData, mod.transformAmount);
            writeWord(imodData, mod.getSecSrcEnum());
            writeWord(imodData, mod.transformType);
        }
    };
    
    for (const inst of this.instruments)
    {
        // global
        writeZone(inst.globalZone);
        for (const instrumentZone of inst.instrumentZones)
        {
            writeZone(instrumentZone);
        }
    }
    
    // terminal modulator, is zero
    writeLittleEndian(imodData, 0, MOD_BYTE_SIZE);
    
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const ximodData = new IndexedByteArray(MOD_BYTE_SIZE);
    writeLittleEndian(ximodData, 0, MOD_BYTE_SIZE);
    
    const imod = writeRIFFChunk(new RiffChunk(
        "imod",
        imodData.length,
        imodData
    ));
    const ximod = writeRIFFChunk(new RiffChunk(
        "imod",
        ximodData.length,
        ximodData
    ));
    return {
        pdta: imod,
        xdta: ximod,
        highestIndex: 0 // not applicable
    };
}