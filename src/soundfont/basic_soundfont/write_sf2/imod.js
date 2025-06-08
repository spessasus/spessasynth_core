import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeLittleEndian, writeWord } from "../../../utils/byte_functions/little_endian.js";
import { RiffChunk, writeRIFFChunk } from "../riff_chunk.js";
import { MOD_BYTE_SIZE } from "../modulator.js";

/**
 * @this {BasicSoundBank}
 * @returns {IndexedByteArray}
 */
export function getIMOD()
{
    // very similar to igen,
    // go through all instruments -> zones and write modulators sequentially
    let imodsize = MOD_BYTE_SIZE; // terminal
    for (const inst of this.instruments)
    {
        imodsize += inst.globalZone.modulators.length * MOD_BYTE_SIZE;
        // start with one mod for global
        imodsize += inst.instrumentZones.reduce((sum, z) => z.modulators.length * MOD_BYTE_SIZE + sum, 0);
    }
    const imoddata = new IndexedByteArray(imodsize);
    
    /**
     * @param z {BasicZone}
     */
    const writeZone = z =>
    {
        for (const mod of z.modulators)
        {
            writeWord(imoddata, mod.getSourceEnum());
            writeWord(imoddata, mod.modulatorDestination);
            writeWord(imoddata, mod.transformAmount);
            writeWord(imoddata, mod.getSecSrcEnum());
            writeWord(imoddata, mod.transformType);
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
    writeLittleEndian(imoddata, 0, MOD_BYTE_SIZE);
    
    return writeRIFFChunk(new RiffChunk(
        "imod",
        imoddata.length,
        imoddata
    ));
}