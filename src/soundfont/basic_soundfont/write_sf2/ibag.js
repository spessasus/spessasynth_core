import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeWord } from "../../../utils/byte_functions/little_endian.js";
import { RiffChunk, writeRIFFChunk } from "../riff_chunk.js";

const BAG_SIZE = 4;

/**
 * @this {BasicSoundBank}
 * @returns {IndexedByteArray}
 */
export function getIBAG()
{
    // write all ibag with their start indexes as they were changed in getIGEN() and getIMOD()
    const ibagsize = this.instruments.reduce(
        (sum, i) =>
            // +1 because global zone
            (i.instrumentZones.length + 1) * BAG_SIZE + sum,
        BAG_SIZE
    );
    const ibagdata = new IndexedByteArray(ibagsize);
    let generatorIndex = 0;
    let modulatorIndex = 0;
    /**
     * @param z {BasicZone}
     */
    const writeZone = z =>
    {
        writeWord(ibagdata, generatorIndex);
        writeWord(ibagdata, modulatorIndex);
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
    writeWord(ibagdata, generatorIndex);
    writeWord(ibagdata, modulatorIndex);
    return writeRIFFChunk(new RiffChunk(
        "ibag",
        ibagdata.length,
        ibagdata
    ));
}