import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import { IndexedByteArray } from "../../../utils/indexed_array";
import { GEN_BYTE_SIZE, Generator } from "../../basic_soundbank/generator";
import {
    DecodedModulator,
    MOD_BYTE_SIZE,
    Modulator
} from "../../basic_soundbank/modulator";
import { BAG_BYTE_SIZE, BasicZone } from "../../basic_soundbank/basic_zone";
import type { ExtendedSF2Chunks } from "./types";
import { INST_BYTE_SIZE } from "../../basic_soundbank/basic_instrument";
import { PHDR_BYTE_SIZE } from "../../basic_soundbank/basic_preset";
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
    // Get headers
    const elements = isPreset ? bank.presets : bank.instruments;
    const genHeader = isPreset ? "pgen" : "igen";
    const modHeader = isPreset ? "pmod" : "imod";
    const bagHeader = isPreset ? "pbag" : "ibag";
    const hdrHeader = isPreset ? "phdr" : "inst";
    const hdrByteSize = isPreset ? PHDR_BYTE_SIZE : INST_BYTE_SIZE;

    // Get indexes
    let currentGenIndex = 0;
    const generatorIndexes = new Array<number>();
    let currentModIndex = 0;
    const modulatorIndexes = new Array<number>();
    const generators = new Array<Generator>();
    const modulators = new Array<Modulator>();
    let zoneIndex = 0;
    const zoneIndexes = new Array<number>();

    const writeZone = (z: BasicZone) => {
        generatorIndexes.push(currentGenIndex);
        const gens = z.getWriteGenerators(bank);
        currentGenIndex += gens.length;
        generators.push(...gens);

        modulatorIndexes.push(currentModIndex);
        const mods = z.modulators;
        currentModIndex += mods.length;
        modulators.push(...mods);
    };

    for (const el of elements) {
        zoneIndexes.push(zoneIndex);
        writeZone(el.globalZone);
        for (const zone of el.zones) writeZone(zone);
        zoneIndex += el.zones.length + 1; // Terminal record
    }
    // Terminal records
    generators.push(new Generator(0, 0, false));
    modulators.push(new DecodedModulator(0, 0, 0, 0, 0));
    generatorIndexes.push(currentGenIndex);
    modulatorIndexes.push(currentModIndex);
    zoneIndexes.push(zoneIndex);

    // Write the parameters
    const genSize = generators.length * GEN_BYTE_SIZE;
    const genData = new IndexedByteArray(genSize);
    for (const g of generators) g.write(genData);

    const modSize = modulators.length * MOD_BYTE_SIZE;
    const modData = new IndexedByteArray(modSize);
    for (const m of modulators) m.write(modData);

    const bagSize = modulatorIndexes.length * BAG_BYTE_SIZE;
    const bagData: ExtendedSF2Chunks = {
        pdta: new IndexedByteArray(bagSize),
        xdta: new IndexedByteArray(bagSize)
    };
    for (const [i, modulatorIndex] of modulatorIndexes.entries()) {
        const generatorIndex = generatorIndexes[i];
        // Bottom WORD: regular ibag
        writeWord(bagData.pdta, generatorIndex & 0xff_ff);
        writeWord(bagData.pdta, modulatorIndex & 0xff_ff);
        // Top WORD: extended ibag
        writeWord(bagData.xdta, generatorIndex >> 16);
        writeWord(bagData.xdta, modulatorIndex >> 16);
    }

    const hdrSize = (elements.length + 1) * hdrByteSize;
    const hdrData: ExtendedSF2Chunks = {
        pdta: new IndexedByteArray(hdrSize),
        xdta: new IndexedByteArray(hdrSize)
    };

    for (const [i, el] of elements.entries()) el.write(hdrData, zoneIndexes[i]);

    // Write terminal header records
    if (isPreset) {
        writeBinaryStringIndexed(hdrData.pdta, "EOP", 20);
        hdrData.pdta.currentIndex += 4; // Program, bank
        writeWord(hdrData.pdta, zoneIndex & 0xff_ff);
        hdrData.pdta.currentIndex += 12; // Library, genre, morphology

        writeBinaryStringIndexed(hdrData.xdta, "", 20);
        hdrData.xdta.currentIndex += 4; // Program, bank
        writeWord(hdrData.xdta, zoneIndex >> 16);
        hdrData.xdta.currentIndex += 12; // Library, genre, morphology
    } else {
        // Write EOI
        writeBinaryStringIndexed(hdrData.pdta, "EOI", 20);
        writeWord(hdrData.pdta, zoneIndex & 0xff_ff);

        writeBinaryStringIndexed(hdrData.xdta, "", 20);
        writeWord(hdrData.xdta, zoneIndex >> 16);
    }

    return {
        writeXdta:
            Math.max(currentGenIndex, currentModIndex, zoneIndex) > 0xff_ff,
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
