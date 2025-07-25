import { readBytesAsString } from "../../utils/byte_functions/string.js";
import { readLittleEndian } from "../../utils/byte_functions/little_endian.js";
import { DLSPreset } from "./dls_preset.js";
import { findRIFFListType, readRIFFChunk } from "../basic_soundbank/riff_chunk.js";
import { SpessaSynthGroupCollapsed, SpessaSynthGroupEnd } from "../../utils/loggin.js";
import { consoleColors } from "../../utils/other.js";
import { Modulator } from "../basic_soundbank/modulator.js";
import { DEFAULT_DLS_CHORUS, DEFAULT_DLS_REVERB } from "./dls_sources.js";
import { generatorLimits, generatorTypes } from "../basic_soundbank/generator_types.js";
import { readRegion } from "./read_region.js";

/**
 * @this {DLSSoundFont}
 * @param chunk {RiffChunk}
 */
export function readDLSInstrument(chunk) {
    this.verifyHeader(chunk, "LIST");
    this.verifyText(readBytesAsString(chunk.chunkData, 4), "ins ");
    /**
     * @type {RiffChunk[]}
     */
    const chunks = [];
    while (chunk.chunkData.length > chunk.chunkData.currentIndex) {
        chunks.push(readRIFFChunk(chunk.chunkData));
    }

    const instrumentHeader = chunks.find((c) => c.header === "insh");
    if (!instrumentHeader) {
        SpessaSynthGroupEnd();
        throw new Error("No instrument header!");
    }

    // read instrument header
    const regions = readLittleEndian(instrumentHeader.chunkData, 4);
    const ulBank = readLittleEndian(instrumentHeader.chunkData, 4);
    const ulInstrument = readLittleEndian(instrumentHeader.chunkData, 4);
    const preset = new DLSPreset(this, ulBank, ulInstrument);

    // read preset name in INFO
    let presetName = ``;
    const infoChunk = findRIFFListType(chunks, "INFO");
    if (infoChunk) {
        let info = readRIFFChunk(infoChunk.chunkData);
        while (info.header !== "INAM") {
            info = readRIFFChunk(infoChunk.chunkData);
        }
        presetName = readBytesAsString(
            info.chunkData,
            info.chunkData.length
        ).trim();
    }
    if (presetName.length < 1) {
        presetName = `unnamed ${(ulBank >> 8) & 127}:${ulInstrument & 127}`;
    }
    preset.presetName = presetName;
    preset.dlsInstrument.instrumentName = presetName;
    SpessaSynthGroupCollapsed(
        `%cParsing %c"${presetName}"%c...`,
        consoleColors.info,
        consoleColors.recognized,
        consoleColors.info
    );

    // list of regions
    const regionListChunk = findRIFFListType(chunks, "lrgn");
    if (!regionListChunk) {
        SpessaSynthGroupEnd();
        throw new Error("No region list!");
    }

    // global articulation: essentially global zone
    const globalZone = preset.dlsInstrument.globalZone;

    // read articulators
    const globalLart = findRIFFListType(chunks, "lart");
    const globalLar2 = findRIFFListType(chunks, "lar2");
    if (globalLar2 !== undefined || globalLart !== undefined) {
        this.readLart(globalLart, globalLar2, globalZone);
    }
    // remove generators with default values
    globalZone.generators = globalZone.generators.filter(
        (g) => g.generatorValue !== generatorLimits[g.generatorType].def
    );
    // override reverb and chorus with 1000 instead of 200 (if not override)
    // reverb
    if (
        globalZone.modulators.find(
            (m) => m.modulatorDestination === generatorTypes.reverbEffectsSend
        ) === undefined
    ) {
        globalZone.addModulators(Modulator.copy(DEFAULT_DLS_REVERB));
    }
    // chorus
    if (
        globalZone.modulators.find(
            (m) => m.modulatorDestination === generatorTypes.chorusEffectsSend
        ) === undefined
    ) {
        globalZone.addModulators(Modulator.copy(DEFAULT_DLS_CHORUS));
    }

    // read regions
    for (let i = 0; i < regions; i++) {
        const chunk = readRIFFChunk(regionListChunk.chunkData);
        this.verifyHeader(chunk, "LIST");
        const type = readBytesAsString(chunk.chunkData, 4);
        if (type !== "rgn " && type !== "rgn2") {
            SpessaSynthGroupEnd();
            this.parsingError(
                `Invalid DLS region! Expected "rgn " or "rgn2" got "${type}"`
            );
        }

        readRegion.call(this, chunk, preset.dlsInstrument);
    }
    this.addPresets(preset);
    this.addInstruments(preset.dlsInstrument);
    SpessaSynthGroupEnd();
}
