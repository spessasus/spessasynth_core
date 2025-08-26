import { IndexedByteArray } from "../../../utils/indexed_array";
import { writeBinaryStringIndexed } from "../../../utils/byte_functions/string";
import {
    writeDword,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import { writeRIFFChunkRaw } from "../../../utils/riff_chunk";
import type { BasicSoundBank } from "../basic_soundbank";
import type { ReturnedExtendedSf2Chunks } from "../../types";

const PHDR_SIZE = 38;

export function getPHDR(bank: BasicSoundBank): ReturnedExtendedSf2Chunks {
    const phdrSize = bank.presets.length * PHDR_SIZE + PHDR_SIZE;
    const phdrData = new IndexedByteArray(phdrSize);
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const xphdrData = new IndexedByteArray(phdrSize);
    // The preset start is adjusted in pbag, this is only for the terminal preset index
    let presetStart = 0;
    for (const preset of bank.presets) {
        writeBinaryStringIndexed(phdrData, preset.name.substring(0, 20), 20);
        writeBinaryStringIndexed(xphdrData, preset.name.substring(20), 20);

        writeWord(phdrData, preset.program);
        let wBank = preset.bankMSB;
        if (preset.isGMGSDrum) {
            // Drum flag
            wBank = 0x80;
        } else if (preset.bankMSB === 0) {
            // If bank MSB is zero, write bank LSB (XG)
            wBank = preset.bankLSB;
        }
        writeWord(phdrData, wBank);
        writeWord(phdrData, presetStart & 0xffff);

        xphdrData.currentIndex += 4;
        writeWord(xphdrData, presetStart >> 16);

        // 3 unused dword, spec says to keep em so we do
        writeDword(phdrData, preset.library);
        writeDword(phdrData, preset.genre);
        writeDword(phdrData, preset.morphology);

        xphdrData.currentIndex += 12;

        presetStart += preset.zones.length + 1; // Global
    }
    // Write EOP
    writeBinaryStringIndexed(phdrData, "EOP", 20);
    phdrData.currentIndex += 4; // Program, bank
    writeWord(phdrData, presetStart & 0xffff);
    phdrData.currentIndex += 12; // Library, genre, morphology

    writeBinaryStringIndexed(xphdrData, "EOP", 20);
    xphdrData.currentIndex += 4; // Program, bank
    writeWord(xphdrData, presetStart >> 16);
    xphdrData.currentIndex += 12; // Library, genre, morphology

    const phdr = writeRIFFChunkRaw("phdr", phdrData);

    const xphdr = writeRIFFChunkRaw("phdr", xphdrData);

    return {
        pdta: phdr,
        xdta: xphdr,
        highestIndex: presetStart
    };
}
