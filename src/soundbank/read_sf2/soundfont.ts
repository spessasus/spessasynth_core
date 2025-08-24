import { IndexedByteArray } from "../../utils/indexed_array";
import { readSamples } from "./samples";
import { readLittleEndianIndexed } from "../../utils/byte_functions/little_endian";
import { readGenerators } from "./generators";
import { applyPresetZones } from "./preset_zones";
import { readPresets } from "./presets";
import { readInstruments } from "./instruments";
import { readModulators } from "./modulators";
import { readRIFFChunk, RIFFChunk } from "../../utils/riff_chunk";
import { consoleColors } from "../../utils/other";
import { SpessaSynthGroup, SpessaSynthGroupEnd, SpessaSynthInfo } from "../../utils/loggin";
import { readBinaryString, readBinaryStringIndexed } from "../../utils/byte_functions/string";
import { stbvorbis } from "../../externals/stbvorbis_sync/stbvorbis_wrapper";
import { BasicSoundBank } from "../basic_soundbank/basic_soundbank";
import { applyInstrumentZones } from "./instrument_zones";
import { readZoneIndexes } from "./zones";
import type { SF2InfoFourCC } from "../types";
import type { Generator } from "../basic_soundbank/generator";
import type { Modulator } from "../basic_soundbank/modulator";
import { parseDateString } from "../../utils/load_date";
import { BasicPreset } from "../basic_soundbank/basic_preset";
import { XG_SFX_VOICE } from "../../utils/xg_hacks";
import { BasicPresetZone } from "../basic_soundbank/basic_preset_zone";

/**
 * Soundfont.ts
 * purpose: parses a soundfont2 file
 */

export class SoundFont2 extends BasicSoundBank {
    protected sampleDataStartIndex = 0;

    /**
     * Initializes a new SoundFont2 Parser and parses the given data array
     */
    public constructor(arrayBuffer: ArrayBuffer, warnDeprecated = true) {
        super();
        if (warnDeprecated) {
            throw new Error(
                "Using the constructor directly is deprecated. Use SoundBankLoader.fromArrayBuffer() instead."
            );
        }
        const mainFileArray = new IndexedByteArray(arrayBuffer);
        SpessaSynthGroup("%cParsing a SoundFont2 file...", consoleColors.info);
        if (!mainFileArray) {
            SpessaSynthGroupEnd();
            this.parsingError("No data provided!");
        }

        // Read the main chunk
        const firstChunk = readRIFFChunk(mainFileArray, false);
        this.verifyHeader(firstChunk, "riff");

        const type = readBinaryStringIndexed(mainFileArray, 4).toLowerCase();
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
        const infoString = readBinaryStringIndexed(infoChunk.data, 4);
        if (infoString !== "INFO") {
            SpessaSynthGroupEnd();
            throw new SyntaxError(
                `Invalid soundFont! Expected "INFO" or "${infoString}"`
            );
        }

        let xdtaChunk: RIFFChunk | undefined = undefined;

        while (infoChunk.data.length > infoChunk.data.currentIndex) {
            const chunk = readRIFFChunk(infoChunk.data);
            const text = readBinaryString(chunk.data, chunk.data.length);
            // Special cases
            const headerTyped = chunk.header as SF2InfoFourCC;
            switch (headerTyped) {
                case "ifil":
                case "iver":
                    const major = readLittleEndianIndexed(chunk.data, 2);
                    const minor = readLittleEndianIndexed(chunk.data, 2);
                    if (headerTyped === "ifil") {
                        this.soundBankInfo.version = {
                            major,
                            minor
                        };
                    } else {
                        this.soundBankInfo.romVersion = {
                            major,
                            minor
                        };
                    }
                    break;

                // Dmod: default modulators
                case "DMOD": {
                    // Override default modulators
                    this.defaultModulators = readModulators(chunk);
                    this.customDefaultModulators = true;
                    break;
                }

                case "LIST": {
                    // Possible xdta
                    const listType = readBinaryStringIndexed(chunk.data, 4);
                    if (listType === "xdta") {
                        SpessaSynthInfo(
                            "%cExtended SF2 found!",
                            consoleColors.recognized
                        );
                        xdtaChunk = chunk;
                    }
                    break;
                }

                case "ICRD":
                    this.soundBankInfo.creationDate = parseDateString(
                        readBinaryStringIndexed(chunk.data, chunk.data.length)
                    );
                    break;

                case "ISFT":
                    this.soundBankInfo.software = text;
                    break;

                case "IPRD":
                    this.soundBankInfo.product = text;
                    break;

                case "IENG":
                    this.soundBankInfo.engineer = text;
                    break;

                case "ICOP":
                    this.soundBankInfo.copyright = text;
                    break;

                case "INAM":
                    this.soundBankInfo.name = text;
                    break;

                case "ICMT":
                    this.soundBankInfo.comment = text;
                    break;

                case "irom":
                    this.soundBankInfo.romInfo = text;
                    break;

                case "isng":
                    this.soundBankInfo.soundEngine = text;
            }
        }
        this.printInfo();
        // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
        const xChunks: Partial<{
            phdr: RIFFChunk;
            pbag: RIFFChunk;
            pmod: RIFFChunk;
            pgen: RIFFChunk;
            inst: RIFFChunk;
            ibag: RIFFChunk;
            imod: RIFFChunk;
            igen: RIFFChunk;
            shdr: RIFFChunk;
        }> = {};
        if (xdtaChunk !== undefined) {
            // Read the hydra chunks
            xChunks.phdr = readRIFFChunk(xdtaChunk.data);
            xChunks.pbag = readRIFFChunk(xdtaChunk.data);
            xChunks.pmod = readRIFFChunk(xdtaChunk.data);
            xChunks.pgen = readRIFFChunk(xdtaChunk.data);
            xChunks.inst = readRIFFChunk(xdtaChunk.data);
            xChunks.ibag = readRIFFChunk(xdtaChunk.data);
            xChunks.imod = readRIFFChunk(xdtaChunk.data);
            xChunks.igen = readRIFFChunk(xdtaChunk.data);
            xChunks.shdr = readRIFFChunk(xdtaChunk.data);
        }

        // SDTA
        const sdtaChunk = readRIFFChunk(mainFileArray, false);
        this.verifyHeader(sdtaChunk, "list");
        this.verifyText(readBinaryStringIndexed(mainFileArray, 4), "sdta");

        // Smpl
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
                throw new Error(
                    `SF2Pack Ogg Vorbis decode error: ${e as Error}`
                );
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
        readBinaryStringIndexed(presetChunk.data, 4);

        // Read the hydra chunks
        const phdrChunk = readRIFFChunk(presetChunk.data);
        this.verifyHeader(phdrChunk, "phdr");

        const pbagChunk = readRIFFChunk(presetChunk.data);
        this.verifyHeader(pbagChunk, "pbag");

        const pmodChunk = readRIFFChunk(presetChunk.data);
        this.verifyHeader(pmodChunk, "pmod");

        const pgenChunk = readRIFFChunk(presetChunk.data);
        this.verifyHeader(pgenChunk, "pgen");

        const instChunk = readRIFFChunk(presetChunk.data);
        this.verifyHeader(instChunk, "inst");

        const ibagChunk = readRIFFChunk(presetChunk.data);
        this.verifyHeader(ibagChunk, "ibag");

        const imodChunk = readRIFFChunk(presetChunk.data);
        this.verifyHeader(imodChunk, "imod");

        const igenChunk = readRIFFChunk(presetChunk.data);
        this.verifyHeader(igenChunk, "igen");

        const shdrChunk = readRIFFChunk(presetChunk.data);
        this.verifyHeader(shdrChunk, "shdr");

        SpessaSynthInfo("%cParsing samples...", consoleColors.info);

        /**
         * Read all the samples
         * (the current index points to start of the smpl read)
         */
        mainFileArray.currentIndex = this.sampleDataStartIndex;
        const samples = readSamples(
            shdrChunk,
            sampleData,
            xdtaChunk === undefined
        );

        if (xdtaChunk && xChunks.shdr) {
            // Apply extensions to samples
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
        // Trim names
        samples.forEach((s) => (s.name = s.name.trim()));
        this.samples.push(...samples);

        /**
         * Read all the instrument generators
         */
        const instrumentGenerators: Generator[] = readGenerators(igenChunk);

        /**
         * Read all the instrument modulators
         */
        const instrumentModulators: Modulator[] = readModulators(imodChunk);

        const instruments = readInstruments(instChunk);

        if (xdtaChunk && xChunks.inst) {
            // Apply extensions to instruments
            const xInst = readInstruments(xChunks.inst);
            if (xInst.length === instruments.length) {
                instruments.forEach((inst, i) => {
                    inst.name += xInst[i].name;
                    inst.zoneStartIndex |= xInst[i].zoneStartIndex;
                });
                // Adjust zone counts
                instruments.forEach((inst, i) => {
                    if (i < instruments.length - 1) {
                        inst.zonesCount =
                            instruments[i + 1].zoneStartIndex -
                            inst.zoneStartIndex;
                    }
                });
            }
        }
        // Trim names
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
         * Read all the instrument zones (and apply them)
         */
        applyInstrumentZones(
            ibagIndexes,
            instrumentGenerators,
            instrumentModulators,
            this.samples,
            instruments
        );

        /**
         * Read all the preset generators
         */
        const presetGenerators: Generator[] = readGenerators(pgenChunk);

        /**
         * Read all the preset modulators
         */
        const presetModulators: Modulator[] = readModulators(pmodChunk);

        const presets = readPresets(phdrChunk, this);

        if (xdtaChunk && xChunks.phdr) {
            // Apply extensions to presets
            const xPreset = readPresets(xChunks.phdr, this);
            if (xPreset.length === presets.length) {
                presets.forEach((pres, i) => {
                    pres.name += xPreset[i].name;
                    pres.zoneStartIndex |= xPreset[i].zoneStartIndex;
                });
                // Adjust zone counts
                presets.forEach((preset, i) => {
                    if (i < presets.length - 1) {
                        preset.zonesCount =
                            presets[i + 1].zoneStartIndex -
                            preset.zoneStartIndex;
                    }
                });
            }
        }

        // Trim names
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

        // Shadow presets with LSB (for XG)
        const hasLSB = this.presets.some((p) => p.bankLSB > 0);
        if (!hasLSB) {
            SpessaSynthInfo("%cShadowing LSB presets...", consoleColors.info);
            const shadowed = new Array<BasicPreset>();
            for (const preset of this.presets) {
                // Do not shadow presets that do not use LSB variation for XG
                if (preset.isAnyDrums || preset.bankMSB === XG_SFX_VOICE) {
                    continue;
                }
                const shadow = new BasicPreset(this);
                shadow.name = preset.name;
                shadow.bankLSB = preset.bankMSB;
                shadow.globalZone.copyFrom(preset.globalZone);
                shadow.zones = preset.zones.map((oldZone) => {
                    const newZone = new BasicPresetZone(
                        shadow,
                        oldZone.instrument
                    );
                    newZone.copyFrom(oldZone);
                    return newZone;
                });
            }
            this.addPresets(...shadowed);
        }
        this.flush();
        SpessaSynthInfo(
            `%cParsing finished! %c"${this.soundBankInfo.name}"%c has %c${this.presets.length}%c presets,
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

    protected verifyHeader(chunk: RIFFChunk, expected: string) {
        if (chunk.header.toLowerCase() !== expected.toLowerCase()) {
            SpessaSynthGroupEnd();
            this.parsingError(
                `Invalid chunk header! Expected "${expected.toLowerCase()}" got "${chunk.header.toLowerCase()}"`
            );
        }
    }

    protected verifyText(text: string, expected: string) {
        if (text.toLowerCase() !== expected.toLowerCase()) {
            SpessaSynthGroupEnd();
            this.parsingError(
                `Invalid FourCC: Expected "${expected.toLowerCase()}" got "${text.toLowerCase()}"\``
            );
        }
    }
}
