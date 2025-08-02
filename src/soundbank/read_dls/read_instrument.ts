import { readBytesAsString } from "../../utils/byte_functions/string";
import { readLittleEndian } from "../../utils/byte_functions/little_endian";
import { DLSPreset } from "./dls_preset";
import {
    findRIFFListType,
    readRIFFChunk,
    RIFFChunk
} from "../basic_soundbank/riff_chunk";
import {
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd
} from "../../utils/loggin";
import { consoleColors } from "../../utils/other";
import { Modulator } from "../basic_soundbank/modulator";
import {
    DEFAULT_DLS_CHORUS,
    DEFAULT_DLS_REVERB
} from "./default_dls_modulators";
import {
    generatorLimits,
    generatorTypes
} from "../basic_soundbank/generator_types";
import { readRegion } from "./read_region";
import type { DownloadableSounds } from "./downloadable_sounds";
import { readLart } from "./read_lart";

export function readDLSInstrument(this: DownloadableSounds, chunk: RIFFChunk) {
    this.verifyHeader(chunk, "LIST");
    this.verifyText(readBytesAsString(chunk.chunkData, 4), "ins ");
    const chunks: RIFFChunk[] = [];
    while (chunk.chunkData.length > chunk.chunkData.currentIndex) {
        chunks.push(readRIFFChunk(chunk.chunkData));
    }

    const instrumentHeader = chunks.find((c) => c.header === "insh");
    if (!instrumentHeader) {
        SpessaSynthGroupEnd();
        throw new Error("No instrument header!");
    }

    // Read instrument header
    const regions = readLittleEndian(instrumentHeader.chunkData, 4);
    const ulBank = readLittleEndian(instrumentHeader.chunkData, 4);
    const ulInstrument = readLittleEndian(instrumentHeader.chunkData, 4);
    const preset = new DLSPreset(this, ulBank, ulInstrument);

    // Read preset name in INFO
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
    preset.name = presetName;
    preset.dlsInstrument.name = presetName;
    SpessaSynthGroupCollapsed(
        `%cParsing %c"${presetName}"%c...`,
        consoleColors.info,
        consoleColors.recognized,
        consoleColors.info
    );

    // List of regions
    const regionListChunk = findRIFFListType(chunks, "lrgn");
    if (!regionListChunk) {
        SpessaSynthGroupEnd();
        throw new Error("No region list!");
    }

    // global articulation: essentially global zone
    const globalZone = preset.dlsInstrument.globalZone;

    // Read articulators
    const globalLart = findRIFFListType(chunks, "lart");
    const globalLar2 = findRIFFListType(chunks, "lar2");
    if (globalLar2 !== undefined || globalLart !== undefined) {
        readLart.call(this, globalLart, globalLar2, globalZone);
    }
    // Remove generators with default values
    globalZone.generators = globalZone.generators.filter(
        (g) => g.generatorValue !== generatorLimits[g.generatorType].def
    );
    // Override reverb and chorus with 1000 instead of 200 (if not override)
    // Reverb
    if (
        globalZone.modulators.find(
            (m) => m.destination === generatorTypes.reverbEffectsSend
        ) === undefined
    ) {
        globalZone.addModulators(Modulator.copy(DEFAULT_DLS_REVERB));
    }
    // Chorus
    if (
        globalZone.modulators.find(
            (m) => m.destination === generatorTypes.chorusEffectsSend
        ) === undefined
    ) {
        globalZone.addModulators(Modulator.copy(DEFAULT_DLS_CHORUS));
    }

    // Read regions
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
