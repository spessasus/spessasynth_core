import { IndexedByteArray } from "../../../utils/indexed_array";
import { writeStringAsBytes } from "../../../utils/byte_functions/string";
import { writeWord } from "../../../utils/byte_functions/little_endian";
import { writeRIFFChunkRaw } from "../riff_chunk";
import type { BasicSoundBank } from "../basic_soundbank";
import type { ReturnedExtendedSf2Chunks } from "../../types";

const INST_SIZE = 22;

/**
 * @param bank {BasicSoundBank}
 * @returns {ReturnedExtendedSf2Chunks}
 */
export function getINST(bank: BasicSoundBank): ReturnedExtendedSf2Chunks {
    const instSize = bank.instruments.length * INST_SIZE + INST_SIZE;
    const instData = new IndexedByteArray(instSize);
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const xinstData = new IndexedByteArray(instSize);
    // the instrument start index is adjusted in ibag, write it here
    let instrumentStart = 0;
    for (const inst of bank.instruments) {
        writeStringAsBytes(instData, inst.name.substring(0, 20), 20);
        writeStringAsBytes(xinstData, inst.name.substring(20), 20);
        writeWord(instData, instrumentStart & 0xffff);
        writeWord(xinstData, instrumentStart >> 16);
        instrumentStart += inst.zones.length + 1; // global
    }
    // write EOI
    writeStringAsBytes(instData, "EOI", 20);
    writeStringAsBytes(xinstData, "EOI", 20);
    writeWord(instData, instrumentStart & 0xffff);
    writeWord(xinstData, instrumentStart >> 16);

    const inst = writeRIFFChunkRaw("inst", instData);
    const xinst = writeRIFFChunkRaw("inst", xinstData);

    return {
        pdta: inst,
        xdta: xinst,
        highestIndex: instrumentStart
    };
}
