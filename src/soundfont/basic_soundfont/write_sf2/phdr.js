import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeStringAsBytes } from "../../../utils/byte_functions/string.js";
import { writeDword, writeWord } from "../../../utils/byte_functions/little_endian.js";
import { writeRIFFChunkRaw } from "../riff_chunk.js";

const PHDR_SIZE = 38;

/**
 * @this {BasicSoundBank}
 * @returns {ReturnedExtendedSf2Chunks}
 */
export function getPHDR()
{
    const phdrSize = this.presets.length * PHDR_SIZE + PHDR_SIZE;
    const phdrData = new IndexedByteArray(phdrSize);
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const xphdrData = new IndexedByteArray(phdrSize);
    // the preset start is adjusted in pbag, this is only for the terminal preset index
    let presetStart = 0;
    for (const preset of this.presets)
    {
        writeStringAsBytes(phdrData, preset.presetName.substring(0, 20), 20);
        writeStringAsBytes(xphdrData, preset.presetName.substring(20), 20);
        
        writeWord(phdrData, preset.program);
        writeWord(phdrData, preset.bank);
        writeWord(phdrData, presetStart & 0xFFFF);
        
        xphdrData.currentIndex += 4;
        writeWord(xphdrData, presetStart >> 16);
        
        // 3 unused dword, spec says to keep em so we do
        writeDword(phdrData, preset.library);
        writeDword(phdrData, preset.genre);
        writeDword(phdrData, preset.morphology);
        
        xphdrData.currentIndex += 12;
        
        presetStart += preset.presetZones.length + 1; // global
    }
    // write EOP
    writeStringAsBytes(phdrData, "EOP", 20);
    phdrData.currentIndex += 4; // program, bank
    writeWord(phdrData, presetStart & 0xFFFF);
    phdrData.currentIndex += 12;// library, genre, morphology
    
    writeStringAsBytes(xphdrData, "EOP", 20);
    xphdrData.currentIndex += 4; // program, bank
    writeWord(xphdrData, presetStart >> 16);
    xphdrData.currentIndex += 12;// library, genre, morphology
    
    const phdr = writeRIFFChunkRaw("phdr", phdrData);
    
    const xphdr = writeRIFFChunkRaw("phdr", xphdrData);
    
    return {
        pdta: phdr,
        xdta: xphdr,
        highestIndex: presetStart
    };
}