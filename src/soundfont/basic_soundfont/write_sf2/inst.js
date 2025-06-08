import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeStringAsBytes } from "../../../utils/byte_functions/string.js";
import { writeWord } from "../../../utils/byte_functions/little_endian.js";
import { RiffChunk, writeRIFFChunk } from "../riff_chunk.js";

const INST_SIZE = 22;

/**
 * @this {BasicSoundBank}
 * @returns {IndexedByteArray}
 */
export function getINST()
{
    const instsize = this.instruments.length * INST_SIZE + INST_SIZE;
    const instdata = new IndexedByteArray(instsize);
    // the instrument start index is adjusted in ibag, write it here
    let instrumentStart = 0;
    for (const inst of this.instruments)
    {
        writeStringAsBytes(instdata, inst.instrumentName, 20);
        writeWord(instdata, instrumentStart);
        instrumentStart += inst.instrumentZones.length + 1; // global
    }
    // write EOI
    writeStringAsBytes(instdata, "EOI", 20);
    writeWord(instdata, instrumentStart);
    
    return writeRIFFChunk(new RiffChunk(
        "inst",
        instdata.length,
        instdata
    ));
}