import { readBinaryStringIndexed } from "../../utils/byte_functions/string";
import { readLittleEndianIndexed } from "../../utils/byte_functions/little_endian";
import { DLSPreset } from "./dls_preset";
import {
    findRIFFListType,
    readRIFFChunk,
    RIFFChunk
} from "../../utils/riff_chunk";
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
    this.verifyText(readBinaryStringIndexed(chunk.data, 4), "ins ");
    const chunks: RIFFChunk[] = [];
    while (chunk.data.length > chunk.data.currentIndex) {
        chunks.push(readRIFFChunk(chunk.data));
    }

    const instrumentHeader = chunks.find((c) => c.header === "insh");
    if (!instrumentHeader) {
        SpessaSynthGroupEnd();
        throw new Error("No instrument header!");
    }

    // Read instrument header
    const regions = readLittleEndianIndexed(instrumentHeader.data, 4);
    const ulBank = readLittleEndianIndexed(instrumentHeader.data, 4);
    const ulInstrument = readLittleEndianIndexed(instrumentHeader.data, 4);
    const preset = new DLSPreset(this, ulBank, ulInstrument);

    // Read preset name in INFO
    let presetName = ``;
    const infoChunk = findRIFFListType(chunks, "INFO");
    if (infoChunk) {
        let info = readRIFFChunk(infoChunk.data);
        while (info.header !== "INAM") {
            info = readRIFFChunk(infoChunk.data);
        }
        presetName = readBinaryStringIndexed(
            info.data,
            info.data.length
        ).trim();
    }
    if (presetName.length < 1) {
        presetName = `unnamed ${preset.toMIDIString()}`;
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
        readLart.call(this, globalZone, globalLart, globalLar2);
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
        const chunk = readRIFFChunk(regionListChunk.data);
        this.verifyHeader(chunk, "LIST");
        const type = readBinaryStringIndexed(chunk.data, 4);
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
