import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeStringAsBytes } from "../../../utils/byte_functions/string.js";
import { writeWord } from "../../../utils/byte_functions/little_endian.js";
import { RiffChunk, writeRIFFChunk } from "../riff_chunk.js";

const INST_SIZE = 22;

/**
 * @this {BasicSoundBank}
 * @returns {ReturnedExtendedSf2Chunks}
 */
export function getINST()
{
    const instSize = this.instruments.length * INST_SIZE + INST_SIZE;
    const instData = new IndexedByteArray(instSize);
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const xinstData = new IndexedByteArray(instSize);
    // the instrument start index is adjusted in ibag, write it here
    let instrumentStart = 0;
    for (const inst of this.instruments)
    {
        writeStringAsBytes(instData, inst.instrumentName.substring(0, 20), 20);
        writeStringAsBytes(xinstData, inst.instrumentName.substring(20), 20);
        writeWord(instData, instrumentStart & 0xFFFF);
        writeWord(xinstData, instrumentStart >> 16);
        instrumentStart += inst.instrumentZones.length + 1; // global
    }
    // write EOI
    writeStringAsBytes(instData, "EOI", 20);
    writeStringAsBytes(xinstData, "EOI", 20);
    writeWord(instData, instrumentStart & 0xFFFF);
    writeWord(xinstData, instrumentStart >> 16);
    
    const inst = writeRIFFChunk(new RiffChunk(
        "inst",
        instData.length,
        instData
    ));
    
    const xinst = writeRIFFChunk(new RiffChunk(
        "inst",
        xinstData.length,
        xinstData
    ));
    
    return {
        pdta: inst,
        xdta: xinst,
        highestIndex: instrumentStart
    };
}