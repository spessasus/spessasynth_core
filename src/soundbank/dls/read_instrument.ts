import { readBytesAsString } from "../../utils/byte_functions/string.js";
import { readLittleEndian } from "../../utils/byte_functions/little_endian.js";
import { DLSPreset } from "./dls_preset.js";
import {
    findRIFFListType,
    readRIFFChunk,
    RiffChunk
} from "../basic_soundbank/riff_chunk.js";
import {
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd
} from "../../utils/loggin.js";
import { consoleColors } from "../../utils/other.js";
import { Modulator } from "../basic_soundbank/modulator.js";
import {
    DEFAULT_DLS_CHORUS,
    DEFAULT_DLS_REVERB
} from "./default_dls_modulators.js";
import {
    generatorLimits,
    generatorTypes
} from "../basic_soundbank/generator_types.js";
import { readRegion } from "./read_region.js";
import type { DownloadableSounds } from "./dls_soundfont.ts";
import { readLart } from "./read_lart.ts";

export function readDLSInstrument(dls: DownloadableSounds, chunk: RiffChunk) {
    dls.verifyHeader(chunk, "LIST");
    dls.verifyText(readBytesAsString(chunk.chunkData, 4), "ins ");
    const chunks: RiffChunk[] = [];
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
    const preset = new DLSPreset(dls, ulBank, ulInstrument);

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
        readLart(dls, globalLart, globalLar2, globalZone);
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
        dls.verifyHeader(chunk, "LIST");
        const type = readBytesAsString(chunk.chunkData, 4);
        if (type !== "rgn " && type !== "rgn2") {
            SpessaSynthGroupEnd();
            dls.parsingError(
                `Invalid DLS region! Expected "rgn " or "rgn2" got "${type}"`
            );
        }

        readRegion(dls, chunk, preset.dlsInstrument);
    }
    dls.addPresets(preset);
    dls.addInstruments(preset.dlsInstrument);
    SpessaSynthGroupEnd();
}
