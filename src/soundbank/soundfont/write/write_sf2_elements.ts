import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import { IndexedByteArray } from "../../../utils/indexed_array";
import { GEN_BYTE_SIZE, Generator } from "../../basic_soundbank/generator";
import {
    DecodedModulator,
    MOD_BYTE_SIZE,
    Modulator,
    XMOD_BYTE_SIZE
} from "../../basic_soundbank/modulator";
import type { ModulatorCurve } from "../../basic_soundbank/modulator_curve";
import { BAG_BYTE_SIZE, BasicZone } from "../../basic_soundbank/basic_zone";
import type { ExtendedSF2Chunks, SoundFontWriteFormat } from "./types";
import { INST_BYTE_SIZE } from "../../basic_soundbank/basic_instrument";
import { PHDR_BYTE_SIZE } from "../../basic_soundbank/basic_preset";
import { RIFFChunk } from "../../../utils/riff_chunk";
import { writeBinaryStringIndexed } from "../../../utils/byte_functions/string";
import { writeWord } from "../../../utils/byte_functions/little_endian";
import {
    sf2KeepsGenerator,
    toSF2Generator,
    toSF2Modulators
} from "../sf2_compatibility";

/**
 *
 * @param bank
 * @param format SF2 or SFe
 * @param rf64
 * @param isPreset
 * @param curveIndex SFe only: the index of a custom curve, for the extended modulator records
 */
export function writeSF2Elements(
    bank: BasicSoundBank,
    format: SoundFontWriteFormat,
    rf64: boolean,
    isPreset: boolean,
    curveIndex?: (curve: ModulatorCurve) => number
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
        let gens = z.getWriteGenerators(bank);
        let mods = z.modulators;
        if (format === "sfe") {
            mods = mods.filter((m) => !m.isMissingCurve);
        } else {
            gens = gens
                .filter((g) => sf2KeepsGenerator(g.type, g.value))
                .map((g) => toSF2Generator(g));
            mods = toSF2Modulators(mods);
        }
        currentGenIndex += gens.length;
        generators.push(...gens);

        modulatorIndexes.push(currentModIndex);
        currentModIndex += mods.length;
        modulators.push(...mods);
    };

    for (const el of elements) {
        zoneIndexes.push(zoneIndex);
        writeZone(el.globalZone);
        for (const zone of el.zones) writeZone(zone);
        zoneIndex += el.zones.length + 1; // Global zone
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
    for (const m of modulators)
        m.write(modData, undefined, curveIndex !== undefined);

    // SFe extended modulator records (custom curves), one per flagged modulator, then the terminal.
    // Without them, xdta's pmod and imod only hold the terminal record.
    const customModulators =
        curveIndex === undefined
            ? []
            : modulators.filter((m) => m.usesCustomCurve);
    const writeExtendedMods = customModulators.length > 0;
    // SF2 keeps the terminal of the extended limits proposal, the size of a modulator record
    const xModData = new IndexedByteArray(
        curveIndex === undefined
            ? MOD_BYTE_SIZE
            : (customModulators.length + 1) * XMOD_BYTE_SIZE
    );
    if (curveIndex) {
        for (const m of customModulators) m.writeExtended(xModData, curveIndex);
    }

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

    for (const [i, el] of elements.entries())
        el.write(hdrData, zoneIndexes[i], format);

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
            writeExtendedMods ||
            Math.max(currentGenIndex, currentModIndex, zoneIndex) > 0xff_ff,
        gen: {
            pdta: RIFFChunk.write(genHeader, genData, rf64),
            // Same as pmod, this chunk includes only the terminal generator record to allow reuse of the pdta parser.
            xdta: RIFFChunk.write(
                genHeader,
                new IndexedByteArray(GEN_BYTE_SIZE),
                rf64
            )
        },
        mod: {
            pdta: RIFFChunk.write(modHeader, modData, rf64),
            // Only the terminal record (parser compatibility), or the SFe extended records
            xdta: RIFFChunk.write(modHeader, xModData, rf64)
        },
        bag: {
            pdta: RIFFChunk.write(bagHeader, bagData.pdta, rf64),
            xdta: RIFFChunk.write(bagHeader, bagData.xdta, rf64)
        },
        hdr: {
            pdta: RIFFChunk.write(hdrHeader, hdrData.pdta, rf64),
            xdta: RIFFChunk.write(hdrHeader, hdrData.xdta, rf64)
        }
    };
}
