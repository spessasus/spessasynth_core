import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import { IndexedByteArray } from "../../../utils/indexed_array";
import { GEN_BYTE_SIZE } from "../../basic_soundbank/generator";
import { MOD_BYTE_SIZE } from "../../basic_soundbank/modulator";
import { BAG_BYTE_SIZE } from "../../basic_soundbank/basic_zone";
import type { ExtendedSF2Chunks, SoundFontWriteIndexes } from "./types";
import { INST_BYTE_SIZE } from "../../basic_soundbank/basic_instrument";
import {
    BasicPreset,
    PHDR_BYTE_SIZE
} from "../../basic_soundbank/basic_preset";
import { writeRIFFChunkRaw } from "../../../utils/riff_chunk";
import { writeBinaryStringIndexed } from "../../../utils/byte_functions/string";
import { writeWord } from "../../../utils/byte_functions/little_endian";

export function writeSF2Elements(
    bank: BasicSoundBank,
    isPreset = false
): {
    gen: ExtendedSF2Chunks;
    mod: ExtendedSF2Chunks;
    bag: ExtendedSF2Chunks;
    hdr: ExtendedSF2Chunks;
    writeXdta: boolean;
} {
    // Note:
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const elements = isPreset ? bank.presets : bank.instruments;
    const genHeader = isPreset ? "pgen" : "igen";
    const modHeader = isPreset ? "pmod" : "imod";
    const bagHeader = isPreset ? "pbag" : "ibag";
    const hdrHeader = isPreset ? "phdr" : "inst";
    const hdrByteSize = isPreset ? PHDR_BYTE_SIZE : INST_BYTE_SIZE;

    const sizes = elements.map((i) =>
        i instanceof BasicPreset ? i.getSize() : i.getSize()
    );

    // Get sizes (make sure to get the terminal records
    const genSize = sizes.reduce((l, s) => l + s.gen, 0) + GEN_BYTE_SIZE;
    const genData = new IndexedByteArray(genSize);
    const modSize = sizes.reduce((l, s) => l + s.mod, 0) + MOD_BYTE_SIZE;
    const modData = new IndexedByteArray(modSize);

    const bagSize = sizes.reduce((l, s) => l + s.bag, 0) + BAG_BYTE_SIZE;
    const bagData: ExtendedSF2Chunks = {
        pdta: new IndexedByteArray(bagSize),
        xdta: new IndexedByteArray(bagSize)
    };

    const hdrSize = sizes.reduce((l, s) => s.hdr + l, 0) + hdrByteSize;
    const hdrData: ExtendedSF2Chunks = {
        pdta: new IndexedByteArray(hdrSize),
        xdta: new IndexedByteArray(hdrSize)
    };

    const indexes: SoundFontWriteIndexes = {
        gen: 0,
        bag: 0,
        mod: 0,
        hdr: 0
    };

    // Write!
    elements.forEach((element) => {
        // This check suppresses the "unused method getSize()" on basic preset...
        if (element instanceof BasicPreset) {
            element.write(genData, modData, bagData, hdrData, indexes, bank);
        } else {
            element.write(genData, modData, bagData, hdrData, indexes, bank);
        }
    });

    // Write terminal records
    if (isPreset) {
        writeBinaryStringIndexed(hdrData.pdta, "EOP", 20);
        hdrData.pdta.currentIndex += 4; // Program, bank
        writeWord(hdrData.pdta, indexes.hdr & 0xffff);
        hdrData.pdta.currentIndex += 12; // Library, genre, morphology

        writeBinaryStringIndexed(hdrData.xdta, "", 20);
        hdrData.xdta.currentIndex += 4; // Program, bank
        writeWord(hdrData.xdta, indexes.hdr >> 16);
        hdrData.xdta.currentIndex += 12; // Library, genre, morphology
    } else {
        // Write EOI
        writeBinaryStringIndexed(hdrData.pdta, "EOI", 20);
        writeBinaryStringIndexed(hdrData.xdta, "", 20);
        writeWord(hdrData.pdta, indexes.hdr & 0xffff);
        writeWord(hdrData.xdta, indexes.hdr >> 16);
    }

    // Write bag terminal record
    writeWord(bagData.pdta, indexes.gen & 0xffff);
    writeWord(bagData.xdta, indexes.gen >> 16);
    writeWord(bagData.pdta, indexes.mod & 0xffff);
    writeWord(bagData.xdta, indexes.mod >> 16);

    return {
        writeXdta:
            Math.max(
                genSize / GEN_BYTE_SIZE,
                modSize / MOD_BYTE_SIZE,
                bagSize / BAG_BYTE_SIZE,
                hdrSize / hdrByteSize
            ) > 0xffff,
        gen: {
            pdta: writeRIFFChunkRaw(genHeader, genData),
            // Same as pmod, this chunk includes only the terminal generator record to allow reuse of the pdta parser.
            xdta: writeRIFFChunkRaw(
                modHeader,
                new IndexedByteArray(GEN_BYTE_SIZE)
            )
        },
        mod: {
            pdta: writeRIFFChunkRaw(modHeader, modData),
            // This chunk exists solely to preserve parser compatibility and contains only the terminal modulator record.
            xdta: writeRIFFChunkRaw(
                modHeader,
                new IndexedByteArray(MOD_BYTE_SIZE)
            )
        },
        bag: {
            pdta: writeRIFFChunkRaw(bagHeader, bagData.pdta),
            xdta: writeRIFFChunkRaw(bagHeader, bagData.xdta)
        },
        hdr: {
            pdta: writeRIFFChunkRaw(hdrHeader, hdrData.pdta),
            xdta: writeRIFFChunkRaw(hdrHeader, hdrData.xdta)
        }
    };
}
