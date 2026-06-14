import { IndexedByteArray } from "../../../utils/indexed_array";
import { readSamples } from "./samples";
import { readLittleEndianIndexed } from "../../../utils/byte_functions/little_endian";
import { readGenerators } from "./generators";
import { applyPresetZones } from "./preset_zones";
import { readPresets } from "./presets";
import { readInstruments } from "./instruments";
import { readModulators } from "./modulators";
import { RIFFChunk } from "../../../utils/riff_chunk";
import { ConsoleColors } from "../../../utils/other";
import { SpessaLog } from "../../../utils/loggin";
import {
    readBinaryString,
    readBinaryStringIndexed
} from "../../../utils/byte_functions/string";
import { stbvorbis } from "../../../externals/stbvorbis_sync/stbvorbis_wrapper";
import { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import { applyInstrumentZones } from "./instrument_zones";
import { readZoneIndexes } from "./zones";
import type { SF2InfoFourCC, SFeFeatureFlag, FeatureFlagList } from "../../types";
import type { Generator } from "../../basic_soundbank/generator";
import type { Modulator } from "../../basic_soundbank/modulator";
import { parseDateString } from "../../../utils/date";

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
        super("sf2");
        if (warnDeprecated) {
            throw new Error(
                "Using the constructor directly is deprecated. Use SoundBankLoader.fromArrayBuffer() instead."
            );
        }
        const mainFileArray = new IndexedByteArray(arrayBuffer);
        SpessaLog.group("%cParsing a SoundFont2 file...", ConsoleColors.info);
        if (!mainFileArray) {
            SpessaLog.groupEnd();
            this.parsingError("No data provided!");
        }

        // Read the main chunk
        const firstChunk = RIFFChunk.read(mainFileArray, false);
        this.verifySFeHeader(firstChunk, "riff");

        const type = readBinaryStringIndexed(mainFileArray, 4).toLowerCase();
        if (type !== "sfbk" && type !== "sfpk" && type !== "sfen") {
            SpessaLog.groupEnd();
            throw new SyntaxError(
                `Invalid soundFont! Expected "sfbk", "sfpk" or "sfen" got "${type}"`
            );
        }
        /*
        Some SF2Pack description:
        this is essentially sf2, but the entire smpl chunk is compressed (we only support Ogg Vorbis here)
        and the only other difference is that the main chunk isn't "sfbk" but rather "sfpk"
         */
        const isSF2Pack = type === "sfpk";
        // Const isSFe64 = type === "sfen";

        // INFO
        const infoChunk = RIFFChunk.read(mainFileArray);
        this.verifyHeader(infoChunk, "list");
        const infoString = readBinaryStringIndexed(infoChunk.data, 4);
        if (infoString !== "INFO") {
            SpessaLog.groupEnd();
            throw new SyntaxError(
                `Invalid soundFont! Expected "INFO" got "${infoString}"`
            );
        }

        let xdtaChunk: RIFFChunk | undefined = undefined;
        let isfeChunk: RIFFChunk | undefined = undefined;

        while (infoChunk.data.length > infoChunk.data.currentIndex) {
            const chunk = RIFFChunk.read(infoChunk.data);
            const text = readBinaryString(chunk.data, chunk.data.length);
            // Special cases
            const headerTyped = chunk.header as SF2InfoFourCC;
            switch (headerTyped) {
                case "ifil":
                case "iver": {
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
                }

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
                        SpessaLog.info(
                            "%cExtended SF2 found!",
                            ConsoleColors.recognized
                        );
                        xdtaChunk = chunk;
                    } else if (listType === "ISFe") {
                        SpessaLog.info(
                            "%cISFe-list chunk found!",
                            ConsoleColors.recognized
                        );
                        isfeChunk = chunk;
                    }
                    break;
                }

                case "ICRD": {
                    this.soundBankInfo.creationDate = parseDateString(
                        readBinaryStringIndexed(chunk.data, chunk.data.length)
                    );
                    break;
                }

                case "ISFT": {
                    this.soundBankInfo.software = text;
                    break;
                }

                case "IPRD": {
                    this.soundBankInfo.product = text;
                    break;
                }

                case "IENG": {
                    this.soundBankInfo.engineer = text;
                    break;
                }

                case "ICOP": {
                    this.soundBankInfo.copyright = text;
                    break;
                }

                case "INAM": {
                    this.soundBankInfo.name = text;
                    break;
                }

                case "ICMT": {
                    this.soundBankInfo.comment = text;
                    break;
                }

                case "irom": {
                    this.soundBankInfo.romInfo = text;
                    break;
                }

                case "isng": {
                    this.soundBankInfo.soundEngine = text;
                }
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
            xChunks.phdr = RIFFChunk.read(xdtaChunk.data);
            xChunks.pbag = RIFFChunk.read(xdtaChunk.data);
            xChunks.pmod = RIFFChunk.read(xdtaChunk.data);
            xChunks.pgen = RIFFChunk.read(xdtaChunk.data);
            xChunks.inst = RIFFChunk.read(xdtaChunk.data);
            xChunks.ibag = RIFFChunk.read(xdtaChunk.data);
            xChunks.imod = RIFFChunk.read(xdtaChunk.data);
            xChunks.igen = RIFFChunk.read(xdtaChunk.data);
            xChunks.shdr = RIFFChunk.read(xdtaChunk.data);
        }

        // ISFe-list chunk

        const isfeChunks: Partial<{
            sfty: RIFFChunk;
            sfvx: RIFFChunk;
            flag: RIFFChunk;
        }> = {};
        if (isfeChunk !== undefined) {
            isfeChunks.sfty = RIFFChunk.read(isfeChunk.data);
            isfeChunks.sfvx = RIFFChunk.read(isfeChunk.data);
            isfeChunks.flag = RIFFChunk.read(isfeChunk.data);
            // Verify ISFe-list chunks

            const sftyStr = readBinaryString(isfeChunks.sfty?.data);
            if (sftyStr === "SFe standard") {
                // Trailing sdta chunk is not supported
                SpessaLog.info(
                `%cSFe bank type: %cstandard`,
                ConsoleColors.recognized,
                ConsoleColors.info
                );
            } else {
                SpessaLog.groupEnd();
                this.parsingError(
                    `Invalid SFe bank type: "${sftyStr}"`
                );
            }

            if (isfeChunks.sfvx?.data.length !== 46) {
                // Must be 46 bytes in length otherwise invalid
                SpessaLog.info(
                    `Invalid SFe extended version chunk!`,
                    ConsoleColors.warn
                );
                this.soundBankInfo.version = {
                    major: 4,
                    minor: 0
                };
            } else {
                const sfeMajVer = readLittleEndianIndexed(isfeChunks.sfvx?.data,2);
                const sfeMinVer = readLittleEndianIndexed(isfeChunks.sfvx?.data,2);
                const sfeSpecType = readBinaryStringIndexed(isfeChunks.sfvx?.data,20);
                const sfeDraft = readLittleEndianIndexed(isfeChunks.sfvx?.data,2);
                const sfeVerStr = readBinaryStringIndexed(isfeChunks.sfvx?.data,20);

                if (sfeMajVer >= 5) {
                    // SFe 5 or later, structurally incompatible
                    SpessaLog.groupEnd();
                    this.parsingError(
                        `Unsupported SFe version: "${sfeMajVer}.${sfeMinVer}"`
                    );
                } else if (sfeMajVer == 4 && sfeMinVer > 0) {
                    // SFe 4.1 or later (4.x)
                    SpessaLog.info(
                        `SFe version not fully supported: "${sfeMajVer}.${sfeMinVer}"`,
                        ConsoleColors.warn
                    );
                    this.soundBankInfo.version = {
                        major: 4,
                        minor: 0
                    };
                } else if (sfeMajVer == 4 && sfeMinVer == 0) {
                    // SFe 4.0 (currently the only supported version)
                    SpessaLog.info(
                    `%cSFe bank version: %c${sfeMajVer}.${sfeMinVer}`,
                    ConsoleColors.recognized,
                    ConsoleColors.info
                    );
                    this.soundBankInfo.version = {
                        major: sfeMajVer,
                        minor: sfeMinVer
                    };
                    if (sfeSpecType == "Draft") {
                        SpessaLog.info("%cThis bank is written to a SFe draft specification.", ConsoleColors.warn);
                        SpessaLog.info(
                        `%cDraft revision: %${sfeDraft}`,
                        ConsoleColors.recognized,
                        ConsoleColors.info
                        );
                    } else {
                        // Release Candidate is treated like Final
                        SpessaLog.info(
                        `%cSFe specification type: %c${sfeSpecType}`,
                        ConsoleColors.recognized,
                        ConsoleColors.info
                        );
                    }
                    SpessaLog.info(
                    `%cSFe version string: %c${sfeVerStr}`,
                    ConsoleColors.recognized,
                    ConsoleColors.info
                    );
                } else {
                    // If it's below version 4, we treat this as an non-fatal error condition and ignore it
                    SpessaLog.info(
                        `%cInvalid SFe version: "${sfeMajVer}.${sfeMinVer}"`,
                        ConsoleColors.warn
                    );
                    this.soundBankInfo.version = {
                        major: 4,
                        minor: 0
                    };
                }
            }

            // For now, flags are only used for compatibility check
            const sfeFlags: SFeFeatureFlag[] = [];
            const supportedFlags: FeatureFlagList[] = [];
            if (isfeChunks.flag?.data.length % 6 !== 0) {
                // Feature flags must be a multiple of 6 bytes in length
                SpessaLog.info(
                    `Corrupted feature flag sub-chunk!`,
                    ConsoleColors.warn
                );
            } else {
                while (isfeChunks.flag?.data.length > isfeChunks.flag?.data.currentIndex)
                {
                    this.loadSupportedFlags(supportedFlags);
                    sfeFlags.push(
                        {
                            branch: readLittleEndianIndexed(isfeChunks.flag?.data, 1), 
                            leaf: readLittleEndianIndexed(isfeChunks.flag?.data, 1), 
                            flags: readLittleEndianIndexed(isfeChunks.flag?.data, 4)
                        }
                    );
                }
                for (let i = 0; i < sfeFlags.length; i++)
                {
                    this.verifyFlag(supportedFlags[i], sfeFlags[i]);
                }
            }
        }



        // SDTA
        const sdtaChunk = RIFFChunk.read(mainFileArray, false);
        this.verifyHeader(sdtaChunk, "list");
        this.verifyText(readBinaryStringIndexed(mainFileArray, 4), "sdta");

        // Smpl
        SpessaLog.info("%cVerifying smpl chunk...", ConsoleColors.warn);
        const sampleDataChunk = RIFFChunk.read(mainFileArray, false);
        this.verifyHeader(sampleDataChunk, "smpl");
        let sampleData: IndexedByteArray | Float32Array;
        // SF2Pack: the entire data is compressed
        if (isSF2Pack) {
            SpessaLog.info(
                "%cSF2Pack detected, attempting to decode the smpl chunk...",
                ConsoleColors.info
            );
            try {
                sampleData = stbvorbis.decode(
                    mainFileArray.buffer.slice(
                        mainFileArray.currentIndex,
                        mainFileArray.currentIndex + sdtaChunk.size - 12
                    )
                ).data[0];
            } catch (error) {
                SpessaLog.groupEnd();
                throw new Error(
                    `SF2Pack Ogg Vorbis decode error: ${error as Error}`,
                    { cause: error }
                );
            }
            SpessaLog.info(
                `%cDecoded the smpl chunk! Length: %c${sampleData.length}`,
                ConsoleColors.info,
                ConsoleColors.value
            );
        } else {
            sampleData = mainFileArray;
            this.sampleDataStartIndex = mainFileArray.currentIndex;
            console.log(sampleData);
            console.log(mainFileArray.currentIndex);
        }
        mainFileArray.currentIndex += sampleDataChunk.size;
        console.log(mainFileArray.currentIndex);
        // Sm24
        if (((this.soundBankInfo.version.major > 3)
            || (this.soundBankInfo.version.major == 2 && this.soundBankInfo.version.minor >= 4)
            || (this.soundBankInfo.version.major == 3 && this.soundBankInfo.version.minor >= 4))
            && (!isSF2Pack)) {
                SpessaLog.info("%cThe sm24 chunk is supported. Verifying sm24 chunk...", ConsoleColors.warn);
                if (readBinaryStringIndexed(mainFileArray, 4) === "sm24") {
                    mainFileArray.currentIndex -= 4;
                    const sm24DataChunk = RIFFChunk.read(mainFileArray, false);
                    console.log(sm24DataChunk.data);
                    mainFileArray.currentIndex += sm24DataChunk.size;
                } else {
                    mainFileArray.currentIndex -= 4;
                }
        }

        SpessaLog.info(
            `%cSkipping sample chunk, length: %c${sdtaChunk.size - 12}`,
            ConsoleColors.info,
            ConsoleColors.value
        );
        console.log(mainFileArray.currentIndex);


        // PDTA
        SpessaLog.info("%cLoading preset data chunk...", ConsoleColors.warn);
        const presetChunk = RIFFChunk.read(mainFileArray);
        this.verifyHeader(presetChunk, "list");
        readBinaryStringIndexed(presetChunk.data, 4);

        // Read the hydra chunks
        const phdrChunk = RIFFChunk.read(presetChunk.data);
        this.verifyHeader(phdrChunk, "phdr");

        const pbagChunk = RIFFChunk.read(presetChunk.data);
        this.verifyHeader(pbagChunk, "pbag");

        const pmodChunk = RIFFChunk.read(presetChunk.data);
        this.verifyHeader(pmodChunk, "pmod");

        const pgenChunk = RIFFChunk.read(presetChunk.data);
        this.verifyHeader(pgenChunk, "pgen");

        const instChunk = RIFFChunk.read(presetChunk.data);
        this.verifyHeader(instChunk, "inst");

        const ibagChunk = RIFFChunk.read(presetChunk.data);
        this.verifyHeader(ibagChunk, "ibag");

        const imodChunk = RIFFChunk.read(presetChunk.data);
        this.verifyHeader(imodChunk, "imod");

        const igenChunk = RIFFChunk.read(presetChunk.data);
        this.verifyHeader(igenChunk, "igen");

        const shdrChunk = RIFFChunk.read(presetChunk.data);
        this.verifyHeader(shdrChunk, "shdr");

        SpessaLog.info("%cParsing samples...", ConsoleColors.info);

        /**
         * Read all the samples
         * (the current index points to start of the smpl read)
         */
        mainFileArray.currentIndex = this.sampleDataStartIndex;
        
        let samples;
        if (xdtaChunk && xChunks.shdr && shdrChunk.data.length === xChunks.shdr?.data.length) {
            samples = readSamples(
                shdrChunk,
                sampleData,
                xdtaChunk === undefined,
                true,
                xChunks.shdr,
                false,
                this.soundBankInfo.version.major
            );
        } else {
            samples = readSamples(
                shdrChunk,
                sampleData,
                xdtaChunk === undefined,
                false,
                new RIFFChunk("shdr", 1, new IndexedByteArray(1)),
                false,
                this.soundBankInfo.version.major
            );
        }
        // Trim names
        for (const s of samples) s.name = s.name.trim();
        this.samples.push(...samples);

        // Read modulators and generators
        const instrumentGenerators = readGenerators(igenChunk);
        const instrumentModulators = readModulators(imodChunk);

        let instruments;
        if (xdtaChunk && xChunks.inst && instChunk.data.length === xChunks.inst?.data.length) {
            instruments = readInstruments(instChunk, true, xChunks.inst);
        } else {
            instruments = readInstruments(instChunk, false, undefined);
        }
        // Trim names
        for (const i of instruments) i.name = i.name.trim();
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

        // Read preset modulators and generators
        const presetGenerators: Generator[] = readGenerators(pgenChunk);
        const presetModulators: Modulator[] = readModulators(pmodChunk);

        let presets;
        if (xdtaChunk && xChunks.phdr && phdrChunk.data.length === xChunks.phdr?.data.length) {
            presets = readPresets(phdrChunk, this, true, xChunks.phdr);
        } else {
            presets = readPresets(phdrChunk, this, false, undefined);
        }

        // Trim names
        for (const p of presets) p.name = p.name.trim();
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
        SpessaLog.info(
            `%cParsing finished! %c"${this.soundBankInfo.name}"%c has %c${this.presets.length}%c presets,
        %c${this.instruments.length}%c instruments and %c${this.samples.length}%c samples.`,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info
        );
        SpessaLog.groupEnd();
    }

    protected verifyHeader(chunk: RIFFChunk, expected: string) {
        if (chunk.header.toLowerCase() !== expected.toLowerCase()) {
            SpessaLog.groupEnd();
            this.parsingError(
                `Invalid chunk header! Expected "${expected.toLowerCase()}" got "${chunk.header.toLowerCase()}"`
            );
        }
    }

    protected verifySFeHeader(chunk: RIFFChunk) {
        if (chunk.header.toLowerCase() !== "riff" && chunk.header.toLowerCase() !== "rifs") {
            SpessaLog.groupEnd();
            this.parsingError(
                `Invalid chunk header! Expected "riff" or "rifs" got "${chunk.header.toLowerCase()}"`
            );
        }
    }

    protected verifyText(text: string, expected: string) {
        if (text.toLowerCase() !== expected.toLowerCase()) {
            SpessaLog.groupEnd();
            this.parsingError(
                `Invalid FourCC: Expected "${expected.toLowerCase()}" got "${text.toLowerCase()}"\``
            );
        }
    }

    protected loadSupportedFlags(supportedList: FeatureFlagList[])
    {
        // Todo: do this in a better way
        supportedList.push({branch: 0, leaf: 0,  flags: 15,        featureName: "Tuning"});
        supportedList.push({branch: 0, leaf: 1,  flags: 3,         featureName: "Looping"});
        supportedList.push({branch: 0, leaf: 2,  flags: 1,         featureName: "Filter Types"});
        supportedList.push({branch: 0, leaf: 3,  flags: 884736096, featureName: "Filter Params"});
        supportedList.push({branch: 0, leaf: 4,  flags: 7,         featureName: "Attenuation"});
        supportedList.push({branch: 0, leaf: 5,  flags: 69391,     featureName: "Effects"});
        supportedList.push({branch: 0, leaf: 6,  flags: 15,        featureName: "LFO"});
        supportedList.push({branch: 0, leaf: 7,  flags: 524287,    featureName: "Envelopes"});
        supportedList.push({branch: 0, leaf: 8,  flags: 231169,    featureName: "MIDI CC"});
        supportedList.push({branch: 0, leaf: 9,  flags: 127,       featureName: "Generators"});
        supportedList.push({branch: 0, leaf: 10, flags: 127,       featureName: "Zones"});
        supportedList.push({branch: 0, leaf: 11, flags: 0,         featureName: "Reserved"});
        supportedList.push({branch: 1, leaf: 0,  flags: 16383,     featureName: "Modulators"});
        supportedList.push({branch: 1, leaf: 1,  flags: 51,        featureName: "Modulator Controllers"});
        supportedList.push({branch: 1, leaf: 2,  flags: 998838,    featureName: "Modulator Parameters"});
        supportedList.push({branch: 1, leaf: 3,  flags: 672137215, featureName: "Modulator Parameters"});
        supportedList.push({branch: 1, leaf: 4,  flags: 0,         featureName: "Modulator Parameters"});
        supportedList.push({branch: 1, leaf: 5,  flags: 0,         featureName: "NRPN"});
        supportedList.push({branch: 1, leaf: 6,  flags: 263167,    featureName: "Default Modulators"});
        supportedList.push({branch: 1, leaf: 7,  flags: 0,         featureName: "Reserved"});
        supportedList.push({branch: 1, leaf: 8,  flags: 0,         featureName: "Reserved"});
        supportedList.push({branch: 2, leaf: 0,  flags: 1,         featureName: "24-Bit Samples"});
        supportedList.push({branch: 2, leaf: 1,  flags: 0,         featureName: "8-Bit Samples"});
        supportedList.push({branch: 2, leaf: 2,  flags: 0,         featureName: "32-Bit Samples"});
        supportedList.push({branch: 2, leaf: 3,  flags: 0,         featureName: "64-Bit Samples"});
        supportedList.push({branch: 3, leaf: 0,  flags: 1,         featureName: "SFe Compression"});
        supportedList.push({branch: 3, leaf: 1,  flags: 1,         featureName: "Compression Formats"});
        supportedList.push({branch: 4, leaf: 0,  flags: 0,         featureName: "Metadata"});
        supportedList.push({branch: 4, leaf: 1,  flags: 0,         featureName: "Reserved"});
        supportedList.push({branch: 4, leaf: 2,  flags: 0,         featureName: "Sample ROM"});
        supportedList.push({branch: 4, leaf: 3,  flags: 0,         featureName: "ROM Emulator"});
        supportedList.push({branch: 4, leaf: 4,  flags: 0,         featureName: "Reserved"});
        supportedList.push({branch: 5, leaf: 0,  flags: 0,         featureName: "End of Flags"});
    }

    protected verifyFlag(supported: FeatureFlagList, bankFlags: SFeFeatureFlag)
    {
        if (!(supported.featureName === "Reserved" || supported.featureName === "End of Flags")) {
            if (((supported.flags & bankFlags.flags) === bankFlags.flags))
            {
                SpessaLog.info(
                    `%cFeature branch %c${bankFlags.branch} leaf ${bankFlags.leaf} (${supported.featureName}) %cfully supported`,
                    ConsoleColors.recognized,
                    ConsoleColors.info,
                    ConsoleColors.recognized                
                );
            } else {
                SpessaLog.info(
                    `%cFeature branch ${bankFlags.branch} leaf ${bankFlags.leaf} (${supported.featureName}) not fully supported`,
                    ConsoleColors.warn
                );
            }
        }
    }
}
