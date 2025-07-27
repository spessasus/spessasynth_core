import { IndexedByteArray } from "../../utils/indexed_array";
import { readSamples } from "./samples";
import { readLittleEndian } from "../../utils/byte_functions/little_endian";
import { readGenerators } from "./generators";
import { applyPresetZones } from "./preset_zones";
import { readPresets } from "./presets";
import { readInstruments } from "./instruments";
import { readModulators } from "./modulators";
import { readRIFFChunk, RiffChunk } from "../basic_soundbank/riff_chunk";
import { consoleColors } from "../../utils/other";
import { SpessaSynthGroup, SpessaSynthGroupEnd, SpessaSynthInfo } from "../../utils/loggin";
import { readBytesAsString } from "../../utils/byte_functions/string";
import { stbvorbis } from "../../externals/stbvorbis_sync/stbvorbis_wrapper";
import { BasicSoundBank } from "../basic_soundbank/basic_soundbank";
import { applyInstrumentZones } from "./instrument_zones";
import { readZoneIndexes } from "./zones";
import type { SoundBankInfoFourCC } from "../types";
import type { Generator } from "../basic_soundbank/generator";
import type { Modulator } from "../basic_soundbank/modulator";

/**
 * soundfont.js
 * purpose: parses a soundfont2 file
 */

export class SoundFont2 extends BasicSoundBank {
    protected sampleDataStartIndex: number = 0;

    /**
     * Initializes a new SoundFont2 Parser and parses the given data array
     */
    constructor(arrayBuffer: ArrayBuffer, warnDeprecated: boolean = true) {
        super();
        if (warnDeprecated) {
            console.warn(
                "Using the constructor directly is deprecated. Use loadSoundFont instead."
            );
        }
        const mainFileArray = new IndexedByteArray(arrayBuffer);
        SpessaSynthGroup("%cParsing SoundFont...", consoleColors.info);
        if (!mainFileArray) {
            SpessaSynthGroupEnd();
            this.parsingError("No data provided!");
        }

        // read the main chunk
        const firstChunk = readRIFFChunk(mainFileArray, false);
        this.verifyHeader(firstChunk, "riff");

        const type = readBytesAsString(mainFileArray, 4).toLowerCase();
        if (type !== "sfbk" && type !== "sfpk") {
            SpessaSynthGroupEnd();
            throw new SyntaxError(
                `Invalid soundFont! Expected "sfbk" or "sfpk" got "${type}"`
            );
        }
        /*
        Some SF2Pack description:
        this is essentially sf2, but the entire smpl chunk is compressed (we only support Ogg Vorbis here)
        and the only other difference is that the main chunk isn't "sfbk" but rather "sfpk"
         */
        const isSF2Pack = type === "sfpk";

        // INFO
        const infoChunk = readRIFFChunk(mainFileArray);
        this.verifyHeader(infoChunk, "list");
        const infoString = readBytesAsString(infoChunk.chunkData, 4);
        if (infoString !== "INFO") {
            SpessaSynthGroupEnd();
            throw new SyntaxError(
                `Invalid soundFont! Expected "INFO" or "${infoString}"`
            );
        }

        let xdtaChunk: RiffChunk | undefined = undefined;

        while (infoChunk.chunkData.length > infoChunk.chunkData.currentIndex) {
            const chunk = readRIFFChunk(infoChunk.chunkData);
            let text;
            // special cases
            const headerTyped = chunk.header as SoundBankInfoFourCC;
            switch (headerTyped) {
                case "ifil":
                case "iver":
                    text = `${readLittleEndian(chunk.chunkData, 2)}.${readLittleEndian(chunk.chunkData, 2)}`;
                    this.soundBankInfo[headerTyped] = text;
                    break;

                case "ICMT":
                    text = readBytesAsString(
                        chunk.chunkData,
                        chunk.chunkData.length,
                        false
                    );
                    this.soundBankInfo[headerTyped] = text;
                    break;

                // dmod: default modulators
                case "DMOD": {
                    const newModulators = readModulators(chunk);
                    text = `Modulators: ${newModulators.length}`;

                    // override default modulators
                    this.defaultModulators = newModulators;
                    this.customDefaultModulators = true;
                    this.soundBankInfo[headerTyped] = text;
                    break;
                }

                case "LIST": {
                    // possible xdta
                    const listType = readBytesAsString(chunk.chunkData, 4);
                    if (listType === "xdta") {
                        SpessaSynthInfo(
                            "%cExtended SF2 found!",
                            consoleColors.recognized
                        );
                        xdtaChunk = chunk;
                    }
                    break;
                }

                default:
                    text = readBytesAsString(
                        chunk.chunkData,
                        chunk.chunkData.length
                    );
                    this.soundBankInfo[headerTyped] = text;
            }

            SpessaSynthInfo(
                `%c"${chunk.header}": %c"${text}"`,
                consoleColors.info,
                consoleColors.recognized
            );
        }
        // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
        const xChunks: Partial<{
            phdr: RiffChunk;
            pbag: RiffChunk;
            pmod: RiffChunk;
            pgen: RiffChunk;
            inst: RiffChunk;
            ibag: RiffChunk;
            imod: RiffChunk;
            igen: RiffChunk;
            shdr: RiffChunk;
        }> = {};
        if (xdtaChunk !== undefined) {
            // read the hydra chunks
            xChunks.phdr = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.pbag = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.pmod = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.pgen = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.inst = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.ibag = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.imod = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.igen = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.shdr = readRIFFChunk(xdtaChunk.chunkData);
        }

        // SDTA
        const sdtaChunk = readRIFFChunk(mainFileArray, false);
        this.verifyHeader(sdtaChunk, "list");
        this.verifyText(readBytesAsString(mainFileArray, 4), "sdta");

        // smpl
        SpessaSynthInfo("%cVerifying smpl chunk...", consoleColors.warn);
        const sampleDataChunk = readRIFFChunk(mainFileArray, false);
        this.verifyHeader(sampleDataChunk, "smpl");
        let sampleData: IndexedByteArray | Float32Array;
        // SF2Pack: the entire data is compressed
        if (isSF2Pack) {
            SpessaSynthInfo(
                "%cSF2Pack detected, attempting to decode the smpl chunk...",
                consoleColors.info
            );
            try {
                sampleData = stbvorbis.decode(
                    mainFileArray.buffer.slice(
                        mainFileArray.currentIndex,
                        mainFileArray.currentIndex + sdtaChunk.size - 12
                    )
                ).data[0];
            } catch (e) {
                SpessaSynthGroupEnd();
                throw new Error(`SF2Pack Ogg Vorbis decode error: ${e}`);
            }
            SpessaSynthInfo(
                `%cDecoded the smpl chunk! Length: %c${sampleData.length}`,
                consoleColors.info,
                consoleColors.value
            );
        } else {
            sampleData = mainFileArray;
            this.sampleDataStartIndex = mainFileArray.currentIndex;
        }

        SpessaSynthInfo(
            `%cSkipping sample chunk, length: %c${sdtaChunk.size - 12}`,
            consoleColors.info,
            consoleColors.value
        );
        mainFileArray.currentIndex += sdtaChunk.size - 12;

        // PDTA
        SpessaSynthInfo("%cLoading preset data chunk...", consoleColors.warn);
        const presetChunk = readRIFFChunk(mainFileArray);
        this.verifyHeader(presetChunk, "list");
        readBytesAsString(presetChunk.chunkData, 4);

        // read the hydra chunks
        const phdrChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(phdrChunk, "phdr");

        const pbagChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(pbagChunk, "pbag");

        const pmodChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(pmodChunk, "pmod");

        const pgenChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(pgenChunk, "pgen");

        const instChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(instChunk, "inst");

        const ibagChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(ibagChunk, "ibag");

        const imodChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(imodChunk, "imod");

        const igenChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(igenChunk, "igen");

        const shdrChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(shdrChunk, "shdr");

        /**
         * read all the samples
         * (the current index points to start of the smpl read)
         */
        mainFileArray.currentIndex = this.sampleDataStartIndex;
        const samples = readSamples(
            shdrChunk,
            sampleData,
            xdtaChunk === undefined
        );

        if (xdtaChunk && xChunks.shdr) {
            // apply extensions to samples
            const xSamples = readSamples(
                xChunks.shdr,
                new Float32Array(1),
                false
            );
            if (xSamples.length === samples.length) {
                samples.forEach((s, i) => {
                    s.name += xSamples[i].name;
                    s.linkedSampleIndex |= xSamples[i].linkedSampleIndex << 16;
                });
            }
        }
        // trim names
        samples.forEach((s) => (s.name = s.name.trim()));
        this.samples.push(...samples);

        /**
         * read all the instrument generators
         */
        const instrumentGenerators: Generator[] = readGenerators(igenChunk);

        /**
         * read all the instrument modulators
         */
        const instrumentModulators: Modulator[] = readModulators(imodChunk);

        const instruments = readInstruments(instChunk);

        if (xdtaChunk && xChunks.inst) {
            // apply extensions to instruments
            const xInst = readInstruments(xChunks.inst);
            if (xInst.length === instruments.length) {
                instruments.forEach((inst, i) => {
                    inst.name += xInst[i].name;
                    inst.zoneStartIndex |= xInst[i].zoneStartIndex;
                });
                // adjust zone counts
                instruments.forEach((inst, i) => {
                    if (i < instruments.length - 1) {
                        inst.zonesCount =
                            instruments[i + 1].zoneStartIndex -
                            inst.zoneStartIndex;
                    }
                });
            }
        }
        // trim names
        instruments.forEach((i) => (i.name = i.name.trim()));
        this.instruments.push(...instruments);

        const ibagIndexes = readZoneIndexes(ibagChunk);

        if (xdtaChunk && xChunks.ibag) {
            const extraIndexes = readZoneIndexes(xChunks.ibag);
            for (let i = 0; i < ibagIndexes.mod.length; i++) {
                ibagIndexes.mod[i] |= extraIndexes.mod[i] << 16;
            }
            for (let i = 0; i < ibagIndexes.gen.length; i++) {
                ibagIndexes.gen[i] |= extraIndexes.gen[i] << 16;
            }
        }

        /**
         * read all the instrument zones (and apply them)
         */
        applyInstrumentZones(
            ibagIndexes,
            instrumentGenerators,
            instrumentModulators,
            this.samples,
            instruments
        );

        /**
         * read all the preset generators
         */
        const presetGenerators: Generator[] = readGenerators(pgenChunk);

        /**
         * Read all the preset modulators
         */
        const presetModulators: Modulator[] = readModulators(pmodChunk);

        const presets = readPresets(phdrChunk, this);

        if (xdtaChunk && xChunks.phdr) {
            // apply extensions to presets
            const xPreset = readPresets(xChunks.phdr, this);
            if (xPreset.length === presets.length) {
                presets.forEach((pres, i) => {
                    pres.name += xPreset[i].name;
                    pres.zoneStartIndex |= xPreset[i].zoneStartIndex;
                });
                // adjust zone counts
                presets.forEach((preset, i) => {
                    if (i < presets.length - 1) {
                        preset.zonesCount =
                            presets[i + 1].zoneStartIndex -
                            preset.zoneStartIndex;
                    }
                });
            }
        }

        // trim names
        presets.forEach((p) => p.name === p.name.trim());
        this.addPresets(...presets);

        const pbagIndexes = readZoneIndexes(pbagChunk);

        if (xdtaChunk && xChunks.pbag) {
            const extraIndexes = readZoneIndexes(xChunks.pbag);
            for (let i = 0; i < pbagIndexes.mod.length; i++) {
                pbagIndexes.mod[i] |= extraIndexes.mod[i] << 16;
            }
            for (let i = 0; i < pbagIndexes.gen.length; i++) {
                pbagIndexes.gen[i] |= extraIndexes.gen[i] << 16;
            }
        }

        applyPresetZones(
            pbagIndexes,
            presetGenerators,
            presetModulators,
            this.instruments,
            presets
        );
        this.flush();
        SpessaSynthInfo(
            `%cParsing finished! %c"${this.soundBankInfo["INAM"]}"%c has %c${this.presets.length} %cpresets,
        %c${this.instruments.length}%c instruments and %c${this.samples.length}%c samples.`,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info
        );
        SpessaSynthGroupEnd();
    }

    verifyHeader(chunk: RiffChunk, expected: string) {
        if (chunk.header.toLowerCase() !== expected.toLowerCase()) {
            SpessaSynthGroupEnd();
            this.parsingError(
                `Invalid chunk header! Expected "${expected.toLowerCase()}" got "${chunk.header.toLowerCase()}"`
            );
        }
    }

    verifyText(text: string, expected: string) {
        if (text.toLowerCase() !== expected.toLowerCase()) {
            SpessaSynthGroupEnd();
            this.parsingError(
                `Invalid FourCC: Expected "${expected.toLowerCase()}" got "${text.toLowerCase()}"\``
            );
        }
    }
}
