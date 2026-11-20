import { IndexedByteArray } from "../../../utils/indexed_array";
import { readSamples } from "./samples";
import type { SF2InfoFourCC, SoundBankLoadOptions } from "../../types";
import { readLittleEndianIndexed } from "../../../utils/byte_functions/little_endian";
import { readGenerators } from "./generators";
import { applyPresetZones } from "./preset_zones";
import { readPresets } from "./presets";
import { readInstruments } from "./instruments";
import { readModulators } from "./modulators";
import { readCurves } from "./curves";
import { RIFFChunk } from "../../../utils/riff_chunk";
import { ConsoleColors } from "../../../utils/other";
import { SpessaLog } from "../../../utils/loggin";
import {
    readBinaryString,
    readBinaryStringIndexed
} from "../../../utils/byte_functions/string";
import { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import { applyInstrumentZones } from "./instrument_zones";
import { readZoneIndexes } from "./zones";
import type { Generator } from "../../basic_soundbank/generator";
import { MOD_BYTE_SIZE, type Modulator } from "../../basic_soundbank/modulator";
import { fromSF2DefaultModulators, upgradeSF2Bank } from "../sf2_compatibility";
import { parseDateString } from "../../../utils/date";
import { StbVorbis } from "stb-vorbis";

/**
 * Soundfont.ts
 * purpose: parses a soundfont2 and sfe 4 file
 */

export class SoundFont2 extends BasicSoundBank {
    protected sampleDataStartIndex = 0;

    /**
     * Initializes a new SoundFont2 Parser and parses the given data array
     */
    public constructor(
        arrayBuffer: ArrayBuffer,
        sfe: boolean,
        options: SoundBankLoadOptions
    ) {
        // The default modulators are set once the file's own list is known
        super(sfe ? "sfe" : "sf2", false);
        const mainFileArray = new IndexedByteArray(arrayBuffer);
        SpessaLog.group("%cParsing a SoundFont2 file...", ConsoleColors.info);

        // Read RIFF header
        const fourCC = readBinaryString(mainFileArray, 4).toLowerCase();
        this.verifyTexts(fourCC, ["riff", "rifs"]);
        const rf64 = fourCC === "rifs";
        if (rf64)
            SpessaLog.info("%cRIFF64 Detected!", ConsoleColors.recognized);

        // Read the main chunk (don't verify as we just did)
        RIFFChunk.read(mainFileArray, rf64, false);

        const type = readBinaryStringIndexed(mainFileArray, 4).toLowerCase();
        this.verifyTexts(type, ["sfbk", "sfpk", "sfen"]);
        // 64-bit chunk sizes (RIFS) are only defined for SFe (SFe 4.0, section 3.1)
        if (rf64 && type !== "sfen") {
            throw new Error(`Expected 'sfen' in a 'RIFS' file, got '${type}'`);
        }
        /*
        Some SF2Pack description:
        this is essentially sf2, but the entire smpl chunk is compressed (we only support Ogg Vorbis here)
        and the only other difference is that the main chunk isn't "sfbk" but rather "sfpk"
         */
        const isSF2Pack = type === "sfpk";
        const isSFeType = type === "sfen";

        // INFO
        const infoChunk = RIFFChunk.read(mainFileArray, rf64);
        this.verifyHeader(infoChunk, "list");
        const infoString = readBinaryStringIndexed(infoChunk.data, 4);
        this.verifyText(infoString, "info");

        let xdtaChunk: RIFFChunk | undefined;
        let dmodChunk: RIFFChunk | undefined;
        let curveChunk: RIFFChunk | undefined;
        let xmodChunk: RIFFChunk | undefined;
        // A second DMOD, XMOD, CURV or xdta makes an SFe file invalid (SFe 4.0, section 4.2),
        // In an SF2 file the last one wins as before
        const duplicates = new Array<string>();

        while (infoChunk.data.length > infoChunk.data.currentIndex) {
            const chunk = RIFFChunk.read(infoChunk.data, rf64);
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
                    // Read after INFO, it depends on the version
                    if (dmodChunk) duplicates.push("DMOD");
                    dmodChunk = chunk;
                    break;
                }

                // SFe custom curves and the extended DMOD records
                case "CURV": {
                    if (curveChunk) duplicates.push("CURV");
                    curveChunk = chunk;
                    break;
                }

                case "XMOD": {
                    if (xmodChunk) duplicates.push("XMOD");
                    xmodChunk = chunk;
                    break;
                }

                case "LIST": {
                    // Possible xdta
                    const listType = readBinaryStringIndexed(chunk.data, 4);
                    if (listType === "xdta") {
                        if (xdtaChunk) duplicates.push("xdta");
                        SpessaLog.info(
                            "%cExtended SF2 found!",
                            ConsoleColors.recognized
                        );
                        xdtaChunk = chunk;
                    }
                    break;
                }

                case "ICRD": {
                    this.soundBankInfo.creationDate =
                        parseDateString(
                            readBinaryStringIndexed(
                                chunk.data,
                                chunk.data.length
                            )
                        ) ?? new Date();
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
        // Generators and modulator destinations above endOper are only read from SFe banks.
        // SFe files below version 4 used other generator numbers, read them as SF2.
        const isSFe = isSFeType && this.soundBankInfo.version.major >= 4;
        if (isSFe && duplicates.length > 0) {
            throw new Error(
                `Invalid SFe file: more than one ${duplicates[0]} chunk.`
            );
        }
        this.bankType = isSFe ? "sfe" : "sf2";
        if (isSFeType && this.soundBankInfo.version.major > 4) {
            this.parsingError(
                `SFe version ${this.soundBankInfo.version.major}.${this.soundBankInfo.version.minor} is not supported!`
            );
        }
        if (isSFeType && !isSFe) {
            SpessaLog.warn(
                `SFe version ${this.soundBankInfo.version.major}.${this.soundBankInfo.version.minor} is not supported, reading as SF2!`
            );
        }
        const curves = isSFe && curveChunk ? readCurves(curveChunk) : [];
        // Modulators index the raw list, the bank keeps the valid curves
        for (const curve of curves) {
            if (curve) this.customCurves.push(curve);
        }
        // A DMOD that is not a whole number of 10-byte records is malformed.
        // An SFe file is rejected (SFe 4.0, section 7.3), an SF2 file is read as if it had no DMOD (the section 7.3 list, as section 9.2 says)
        if (dmodChunk && dmodChunk.data.length % MOD_BYTE_SIZE !== 0) {
            if (isSFe) {
                throw new Error(
                    `Invalid DMOD chunk: its size (${dmodChunk.data.length}) is not a multiple of 10 bytes.`
                );
            }
            SpessaLog.warn(
                `Ignoring the DMOD chunk: its size (${dmodChunk.data.length}) is not a multiple of 10 bytes.`
            );
            dmodChunk = undefined;
        }
        if (dmodChunk) {
            const read = readModulators(dmodChunk, isSFe, curves, xmodChunk);
            this.defaultModulators = isSFe
                ? read
                : fromSF2DefaultModulators(this, read);
        } else if (isSFe) {
            // SFe banks always carry their list
            throw new Error(
                "Invalid SFe file: the default modulators (DMOD) are missing."
            );
        } else {
            this.resetDefaultModulators();
        }
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
            xChunks.phdr = RIFFChunk.read(xdtaChunk.data, rf64);
            xChunks.pbag = RIFFChunk.read(xdtaChunk.data, rf64);
            xChunks.pmod = RIFFChunk.read(xdtaChunk.data, rf64);
            xChunks.pgen = RIFFChunk.read(xdtaChunk.data, rf64);
            xChunks.inst = RIFFChunk.read(xdtaChunk.data, rf64);
            xChunks.ibag = RIFFChunk.read(xdtaChunk.data, rf64);
            xChunks.imod = RIFFChunk.read(xdtaChunk.data, rf64);
            xChunks.igen = RIFFChunk.read(xdtaChunk.data, rf64);
            xChunks.shdr = RIFFChunk.read(xdtaChunk.data, rf64);
        }

        // SDTA
        const sdtaChunk = RIFFChunk.read(mainFileArray, rf64, false);
        this.verifyHeader(sdtaChunk, "list");
        this.verifyText(readBinaryStringIndexed(mainFileArray, 4), "sdta");

        // Smpl
        SpessaLog.info("%cVerifying smpl chunk...", ConsoleColors.warn);
        const sampleDataChunk = RIFFChunk.read(mainFileArray, rf64, false);
        this.verifyHeader(sampleDataChunk, "smpl");
        let sampleData: IndexedByteArray | Float32Array;
        // SF2Pack: the entire data is compressed
        if (isSF2Pack) {
            SpessaLog.info(
                "%cSF2Pack detected, attempting to decode the smpl chunk...",
                ConsoleColors.info
            );
            let vorbis;
            try {
                vorbis = StbVorbis.decode(
                    mainFileArray.buffer.slice(
                        mainFileArray.currentIndex,
                        mainFileArray.currentIndex +
                            sdtaChunk.size -
                            4 -
                            sdtaChunk.headerSize
                    )
                );
            } catch (error) {
                SpessaLog.groupEnd();
                throw new Error(
                    `SF2Pack Ogg Vorbis decode error: ${error as Error}`,
                    { cause: error }
                );
            }
            if (vorbis.channels.length !== 1) {
                SpessaLog.groupEnd();
                throw new Error(
                    `The encoded sample data must be mono, received ${vorbis.channels.length} channels.`
                );
            }
            sampleData = vorbis.channels[0];
            SpessaLog.info(
                `%cDecoded the smpl chunk! Length: %c${sampleData.length}`,
                ConsoleColors.info,
                ConsoleColors.value
            );
        } else {
            sampleData = mainFileArray;
            this.sampleDataStartIndex = mainFileArray.currentIndex;
        }

        SpessaLog.info(
            `%cSkipping sample chunk, length: %c${sdtaChunk.size - 4 - sdtaChunk.headerSize}`,
            ConsoleColors.info,
            ConsoleColors.value
        );
        mainFileArray.currentIndex += sdtaChunk.size - 4 - sdtaChunk.headerSize;

        // PDTA
        SpessaLog.info("%cLoading preset data chunk...", ConsoleColors.warn);
        const presetChunk = RIFFChunk.read(mainFileArray, rf64);
        this.verifyHeader(presetChunk, "list");
        this.verifyText(readBinaryStringIndexed(presetChunk.data, 4), "pdta");

        // Read the hydra chunks
        const phdrChunk = RIFFChunk.read(presetChunk.data, rf64);
        this.verifyHeader(phdrChunk, "phdr");

        const pbagChunk = RIFFChunk.read(presetChunk.data, rf64);
        this.verifyHeader(pbagChunk, "pbag");

        const pmodChunk = RIFFChunk.read(presetChunk.data, rf64);
        this.verifyHeader(pmodChunk, "pmod");

        const pgenChunk = RIFFChunk.read(presetChunk.data, rf64);
        this.verifyHeader(pgenChunk, "pgen");

        const instChunk = RIFFChunk.read(presetChunk.data, rf64);
        this.verifyHeader(instChunk, "inst");

        const ibagChunk = RIFFChunk.read(presetChunk.data, rf64);
        this.verifyHeader(ibagChunk, "ibag");

        const imodChunk = RIFFChunk.read(presetChunk.data, rf64);
        this.verifyHeader(imodChunk, "imod");

        const igenChunk = RIFFChunk.read(presetChunk.data, rf64);
        this.verifyHeader(igenChunk, "igen");

        const shdrChunk = RIFFChunk.read(presetChunk.data, rf64);
        this.verifyHeader(shdrChunk, "shdr");

        if (xdtaChunk !== undefined) {
            const pairs: [RIFFChunk | undefined, RIFFChunk, boolean][] = [
                [xChunks.phdr, phdrChunk, true],
                [xChunks.pbag, pbagChunk, true],
                [xChunks.pmod, pmodChunk, false],
                [xChunks.pgen, pgenChunk, false],
                [xChunks.inst, instChunk, true],
                [xChunks.ibag, ibagChunk, true],
                [xChunks.imod, imodChunk, false],
                [xChunks.igen, igenChunk, false],
                [xChunks.shdr, shdrChunk, true]
            ];
            if (
                !pairs.every(
                    ([x, p, sameSize]) =>
                        x?.header.toLowerCase() === p.header.toLowerCase() &&
                        (!sameSize || x.size === p.size)
                )
            ) {
                SpessaLog.warn(
                    "The xdta chunk does not match the pdta chunk, ignoring it."
                );
                xdtaChunk = undefined;
                for (const key of Object.keys(xChunks))
                    delete xChunks[key as keyof typeof xChunks];
            }
        }

        SpessaLog.info("%cParsing samples...", ConsoleColors.info);

        /**
         * Read all the samples
         * (the current index points to start of the smpl read)
         */
        mainFileArray.currentIndex = this.sampleDataStartIndex;
        const samples = readSamples(
            shdrChunk,
            sampleData,
            options,
            xdtaChunk === undefined
        );

        if (xdtaChunk && xChunks.shdr) {
            // Apply extensions to samples
            // Only the names and links are used
            const xSamples = readSamples(
                xChunks.shdr,
                new Float32Array(1),
                { sampleData: false, copySampleData: false },
                false
            );
            if (xSamples.length === samples.length) {
                for (const [i, s] of samples.entries()) {
                    // The xdta half continues only a full name, a zero byte ends it (SFe 4.0, section 5.5)
                    if (s.name.length === 20) s.name += xSamples[i].name;
                    s.linkedSampleIndex |= xSamples[i].linkedSampleIndex << 16;
                }
            }
        }
        // Trim names
        for (const s of samples) s.name = s.name.trim();
        this.addElements(this.samples, samples);

        // Read modulators and generators
        const instrumentGenerators = readGenerators(igenChunk, isSFe);
        const instrumentModulators = readModulators(
            imodChunk,
            isSFe,
            curves,
            xChunks.imod
        );

        // Read the instruments
        // Keep the terminal record (EOI) when extending, the last zone count needs its index
        const extendInstruments = xdtaChunk !== undefined && !!xChunks.inst;
        const instruments = readInstruments(instChunk, extendInstruments);
        if (extendInstruments && xChunks.inst) {
            // Apply extensions to instruments
            const xInst = readInstruments(xChunks.inst, true);
            if (xInst.length === instruments.length) {
                for (const [i, inst] of instruments.entries()) {
                    if (inst.name.length === 20) inst.name += xInst[i].name;
                    inst.zoneStartIndex |= xInst[i].zoneStartIndex << 16;
                }
                // Adjust zone counts
                for (let i = 0; i < instruments.length - 1; i++) {
                    instruments[i].zonesCount =
                        instruments[i + 1].zoneStartIndex -
                        instruments[i].zoneStartIndex;
                }
            }
            // Remove EOI
            instruments.pop();
        }
        // Trim names
        for (const i of instruments) i.name = i.name.trim();
        this.addElements(this.instruments, instruments);

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
        const presetGenerators: Generator[] = readGenerators(pgenChunk, isSFe);
        const presetModulators: Modulator[] = readModulators(
            pmodChunk,
            isSFe,
            curves,
            xChunks.pmod
        );

        // Read presets
        // Keep the terminal record (EOP) when extending, the last zone count needs its index
        const extendPresets = xdtaChunk !== undefined && !!xChunks.phdr;
        const presets = readPresets(phdrChunk, this, extendPresets);
        if (extendPresets && xChunks.phdr) {
            // Apply extensions to presets
            const xPreset = readPresets(xChunks.phdr, this, true);
            if (xPreset.length === presets.length) {
                for (const [i, pres] of presets.entries()) {
                    if (pres.name.length === 20) pres.name += xPreset[i].name;
                    pres.zoneStartIndex |= xPreset[i].zoneStartIndex << 16;
                }
                // Adjust zone counts
                for (let i = 0; i < presets.length - 1; i++) {
                    presets[i].zonesCount =
                        presets[i + 1].zoneStartIndex -
                        presets[i].zoneStartIndex;
                }
            }
            // Remove EOP
            presets.pop();
        }

        // Trim names
        for (const p of presets) p.name = p.name.trim();
        this.addElements(this.presets, presets);

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

        // Convert to SFe
        if (!isSFe) upgradeSF2Bank(this, dmodChunk !== undefined);
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

    protected verifyText(text: string, expected: string) {
        if (text.toLowerCase() !== expected.toLowerCase()) {
            SpessaLog.groupEnd();
            this.parsingError(
                `Invalid FourCC: Expected "${expected.toLowerCase()}" got "${text.toLowerCase()}"`
            );
        }
    }

    protected verifyTexts(text: string, expected: string[]) {
        if (!expected.includes(text.toLowerCase())) {
            SpessaLog.groupEnd();
            this.parsingError(
                `Invalid FourCC: Expected ${expected.map((s) => `"${s}"`).join(", ")} but got "${text.toLowerCase()}"`
            );
        }
    }
}
