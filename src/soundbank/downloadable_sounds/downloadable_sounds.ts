import { DLSVerifier } from "./dls_verifier";
import { DownloadableSoundsSample } from "./sample";
import { DownloadableSoundsInstrument } from "./instrument";
import type {
    DLSInfoFourCC,
    DLSWriteOptions,
    ProgressFunction,
    SF2VersionTag,
    SoundBankInfoData
} from "../types";
import { IndexedByteArray } from "../../utils/indexed_array";
import { ConsoleColors } from "../../utils/other";
import { RIFFChunk } from "../../utils/riff_chunk";
import {
    getStringBytes,
    readBinaryStringIndexed
} from "../../utils/byte_functions/string";
import { parseDateString, toISODateString } from "../../utils/date";
import {
    readLittleEndianIndexed,
    writeDword
} from "../../utils/byte_functions/little_endian";
import { SpessaLog } from "../../utils/loggin";
import { BasicSoundBank } from "../basic_soundbank/basic_soundbank";
import { BankSelectHacks } from "../../utils/midi_hacks";
import { DownloadableSoundsRegion } from "./region";
import { fillWithDefaults } from "../../utils/fill_with_defaults";

export const DEFAULT_DLS_OPTIONS: DLSWriteOptions = {
    software: "SpessaSynth" // ( ͡° ͜ʖ ͡°)
};

export class DownloadableSounds extends DLSVerifier {
    public readonly samples = new Array<DownloadableSoundsSample>();
    public readonly instruments = new Array<DownloadableSoundsInstrument>();
    public soundBankInfo: SoundBankInfoData = {
        name: "Unnamed DLS sound bank",
        creationDate: new Date(),
        software: "SpessaSynth",
        soundEngine: "DLS Level 2.2",
        product: "SpessaSynth DLS",
        version: {
            major: 2,
            minor: 4
        }
    };

    public static read(buffer: ArrayBuffer): DownloadableSounds {
        if (!buffer) {
            throw new Error("No data provided!");
        }
        const dataArray = new IndexedByteArray(buffer);
        SpessaLog.group("%cParsing DLS file...", ConsoleColors.info);

        // Read the main chunk
        const firstChunk = RIFFChunk.read(dataArray, false, false);
        this.verifyHeader(firstChunk, "RIFF");
        this.verifyText(
            readBinaryStringIndexed(dataArray, 4).toLowerCase(),
            "dls "
        );

        /**
         * Read the list
         */
        const chunks: RIFFChunk[] = [];
        while (dataArray.currentIndex < dataArray.length) {
            chunks.push(RIFFChunk.read(dataArray));
        }

        const dls = new DownloadableSounds();

        // Read info
        const infoChunk = RIFFChunk.findListType(chunks, "INFO");
        if (infoChunk) {
            while (infoChunk.data.currentIndex < infoChunk.data.length) {
                const infoPart = RIFFChunk.read(infoChunk.data);
                const headerTyped = infoPart.header as DLSInfoFourCC;
                const text = readBinaryStringIndexed(
                    infoPart.data,
                    infoPart.size
                );
                switch (headerTyped) {
                    case "INAM": {
                        dls.soundBankInfo.name = text;
                        break;
                    }

                    case "ICRD": {
                        dls.soundBankInfo.creationDate = parseDateString(text);
                        break;
                    }

                    case "ICMT": {
                        dls.soundBankInfo.comment = text;
                        break;
                    }

                    case "ISBJ": {
                        dls.soundBankInfo.subject = text;
                        break;
                    }

                    case "ICOP": {
                        dls.soundBankInfo.copyright = text;
                        break;
                    }

                    case "IENG": {
                        dls.soundBankInfo.engineer = text;
                        break;
                    }

                    case "IPRD": {
                        dls.soundBankInfo.product = text;
                        break;
                    }

                    case "ISFT": {
                        dls.soundBankInfo.software = text;
                    }
                }
            }
        }

        this.printInfo(dls);

        // Read "colh"
        const colhChunk = chunks.find((c) => c.header === "colh");
        if (!colhChunk) {
            this.parsingError("No colh chunk!");
            return 5 as never;
        }
        const instrumentAmount = readLittleEndianIndexed(colhChunk.data, 4);
        SpessaLog.info(
            `%cInstruments amount: %c${instrumentAmount}`,
            ConsoleColors.info,
            ConsoleColors.recognized
        );

        // Read the wave list
        const waveListChunk = RIFFChunk.findListType(chunks, "wvpl");
        if (!waveListChunk) {
            this.parsingError("No wvpl chunk!");
            return 5 as never;
        }
        const waveList = this.verifyAndReadList(waveListChunk, "wvpl");
        for (const wave of waveList) {
            dls.samples.push(DownloadableSoundsSample.read(wave));
        }

        // Read the instrument list
        const instrumentListChunk = RIFFChunk.findListType(chunks, "lins");
        if (!instrumentListChunk) {
            this.parsingError("No lins chunk!");
            return 5 as never;
        }
        const instruments = this.verifyAndReadList(instrumentListChunk, "lins");
        SpessaLog.groupCollapsed(
            "%cLoading instruments...",
            ConsoleColors.info
        );
        if (instruments.length !== instrumentAmount) {
            SpessaLog.warn(
                `Colh reported invalid amount of instruments. Detected ${instruments.length}, expected ${instrumentAmount}`
            );
        }
        for (const ins of instruments) {
            dls.instruments.push(
                DownloadableSoundsInstrument.read(dls.samples, ins)
            );
        }
        SpessaLog.groupEnd();

        /*
         MobileBAE Instrument aliasing
         https://github.com/spessasus/spessasynth_core/issues/14
         https://lpcwiki.miraheze.org/wiki/MobileBAE#Proprietary_instrument_aliasing_chunk
         http://onj3.andrelouis.com/phonetones/Software%20and%20Soundbanks/Soundbanks/Beatnik%20mobileBAE/
        */
        const aliasingChunk = chunks.find((c) => c.header === "pgal");
        if (aliasingChunk) {
            SpessaLog.info(
                "%cFound the instrument aliasing chunk!",
                ConsoleColors.recognized
            );
            const pgalData = aliasingChunk.data;
            // Check for the unused 4 bytes at the start
            // If the bank doesn't start with 00 01 02 03, skip them
            if (
                pgalData[0] !== 0 ||
                pgalData[1] !== 1 ||
                pgalData[2] !== 2 ||
                pgalData[3] !== 3
            ) {
                pgalData.currentIndex += 4;
            }
            // Read the drum alias
            const drumInstrument = dls.instruments.find(
                (i) => BankSelectHacks.isXGDrum(i.bankMSB) || i.isGMGSDrum
            );
            if (!drumInstrument) {
                SpessaLog.warn(
                    "MobileBAE aliasing chunk without a drum preset. Aborting!"
                );
                return dls;
            }
            const drumAliases = pgalData.slice(
                pgalData.currentIndex,
                pgalData.currentIndex + 128
            );
            pgalData.currentIndex += 128;
            for (let keyNum = 0; keyNum < 128; keyNum++) {
                const alias = drumAliases[keyNum];
                if (alias === keyNum) {
                    // Skip the same aliases
                    continue;
                }
                const region = drumInstrument.regions.find(
                    (r) => r.keyRange.max === alias && r.keyRange.min === alias
                );
                if (!region) {
                    SpessaLog.warn(
                        `Invalid drum alias ${keyNum} to ${alias}: region does not exist.`
                    );
                    continue;
                }
                const copied = DownloadableSoundsRegion.copyFrom(region);
                copied.keyRange.max = keyNum;
                copied.keyRange.min = keyNum;
                drumInstrument.regions.push(copied);
            }
            // 4 bytes: Unknown purpose, 'footer'.
            pgalData.currentIndex += 4;
            while (pgalData.currentIndex < pgalData.length) {
                const aliasBankNum = readLittleEndianIndexed(pgalData, 2);
                // Little-endian 16-bit value (only 14 bits used): Upper 7 bits: Bank MSB, lower 7 bits: Bank LSB
                const aliasBankLSB = aliasBankNum & 0x7f;
                const aliasBankMSB = (aliasBankNum >> 7) & 0x7f;
                const aliasProgram = pgalData[pgalData.currentIndex++];
                let nullByte = pgalData[pgalData.currentIndex++];
                if (nullByte !== 0) {
                    SpessaLog.warn(
                        `Invalid alias byte. Expected 0, got ${nullByte}`
                    );
                }
                const inputBankNum = readLittleEndianIndexed(pgalData, 2);
                const inputBankLSB = inputBankNum & 0x7f;
                const inputBankMSB = (inputBankNum >> 7) & 0x7f;
                const inputProgram = pgalData[pgalData.currentIndex++];
                nullByte = pgalData[pgalData.currentIndex++];
                if (nullByte !== 0) {
                    SpessaLog.warn(
                        `Invalid alias header. Expected 0, got ${nullByte}`
                    );
                }

                const inputInstrument = dls.instruments.find(
                    (inst) =>
                        inst.bankLSB === inputBankLSB &&
                        inst.bankMSB === inputBankMSB &&
                        inst.program === inputProgram &&
                        !inst.isGMGSDrum
                );
                if (!inputInstrument) {
                    SpessaLog.warn(
                        `Invalid alias. Missing instrument: ${inputBankLSB}:${inputBankMSB}:${inputProgram}`
                    );
                    continue;
                }

                const alias =
                    DownloadableSoundsInstrument.copyFrom(inputInstrument);
                alias.bankMSB = aliasBankMSB;
                alias.bankLSB = aliasBankLSB;
                alias.program = aliasProgram;
                dls.instruments.push(alias);
            }
        }

        SpessaLog.info(
            `%cParsing finished! %c"${dls.soundBankInfo.name || "UNNAMED"}"%c has %c${dls.instruments.length}%c instruments and %c${dls.samples.length}%c samples.`,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info
        );
        SpessaLog.groupEnd();
        return dls;
    }

    /**
     * Performs a full conversion from BasicSoundBank to DownloadableSounds.
     * Includes an optional progress function for transforming the samples.
     */
    public static fromSF(
        bank: BasicSoundBank,
        progressFunc?: ProgressFunction
    ) {
        SpessaLog.groupCollapsed(
            "%cSaving SF2 to DLS level 2...",
            ConsoleColors.info
        );
        const dls = new DownloadableSounds();
        dls.soundBankInfo = { ...bank.soundBankInfo };

        for (let i = 0; i < bank.samples.length; i++) {
            const s = bank.samples[i];
            dls.samples.push(DownloadableSoundsSample.fromSFSample(s));
            progressFunc?.(i / bank.samples.length);
        }
        for (const p of bank.presets) {
            dls.instruments.push(
                DownloadableSoundsInstrument.fromSFPreset(p, bank.samples)
            );
        }

        SpessaLog.info("%cConversion complete!", ConsoleColors.recognized);
        SpessaLog.groupEnd();
        return dls;
    }

    private static printInfo(dls: DownloadableSounds) {
        for (const [info, value] of Object.entries(dls.soundBankInfo)) {
            if (typeof value === "object" && "major" in value) {
                const v = value as SF2VersionTag;
                SpessaLog.info(
                    `%c${info}: %c"${v.major}.${v.minor}"`,
                    ConsoleColors.info,
                    ConsoleColors.recognized
                );
            } else
                SpessaLog.info(
                    `%c${info}: %c${(value as string | Date).toLocaleString()}`,
                    ConsoleColors.info,
                    ConsoleColors.recognized
                );
        }
    }

    /**
     * Writes a DLS file.
     * @param writeOptions the options for writing the file.
     */
    public write(writeOptions: Partial<DLSWriteOptions> = DEFAULT_DLS_OPTIONS) {
        const options: DLSWriteOptions = fillWithDefaults(
            writeOptions,
            DEFAULT_DLS_OPTIONS
        );
        SpessaLog.groupCollapsed("%cSaving DLS...", ConsoleColors.info);
        // Write colh
        const colhNum = new IndexedByteArray(4);
        writeDword(colhNum, this.instruments.length);
        const colh = RIFFChunk.write("colh", colhNum);
        SpessaLog.groupCollapsed(
            "%cWriting instruments...",
            ConsoleColors.info
        );

        const lins = RIFFChunk.getParts(
            "lins",
            this.instruments.map((i) => i.write()),
            true
        );
        SpessaLog.info("%cSuccess!", ConsoleColors.recognized);
        SpessaLog.groupEnd();

        SpessaLog.groupCollapsed(
            "%cWriting WAVE samples...",
            ConsoleColors.info
        );

        let currentIndex = 0;
        const ptblOffsets = [];
        const samples: Uint8Array[] = [];
        let written = 0;
        for (const s of this.samples) {
            const out = s.write();
            options.progressFunction?.(written / this.samples.length);
            SpessaLog.info(
                `%cWrote sample %c${written}. ${s.name}%c of %c${this.samples.length}.`,
                ConsoleColors.info,
                ConsoleColors.recognized,
                ConsoleColors.info,
                ConsoleColors.recognized
            );
            ptblOffsets.push(currentIndex);
            currentIndex += out.reduce((sum, cur) => sum + cur.length, 0);
            samples.push(...out);
            written++;
        }
        const wvpl = RIFFChunk.getParts("wvpl", samples, true);
        SpessaLog.info("%cSucceeded!", ConsoleColors.recognized);

        // Write ptbl
        const ptblData = new IndexedByteArray(8 + 4 * ptblOffsets.length);
        writeDword(ptblData, 8);
        writeDword(ptblData, ptblOffsets.length);
        for (const offset of ptblOffsets) {
            writeDword(ptblData, offset);
        }
        const ptbl = RIFFChunk.write("ptbl", ptblData);
        this.soundBankInfo.software = options.software;

        // Write INFO
        const infos: Uint8Array[] = [];
        const info = this.soundBankInfo;
        const writeDLSInfo = (type: DLSInfoFourCC, data?: string) => {
            if (!data) return;
            infos.push(
                ...RIFFChunk.getParts(type, [getStringBytes(data, true)])
            );
        };

        writeDLSInfo("INAM", info.name);
        writeDLSInfo("ICMT", info.comment);
        writeDLSInfo("ICOP", info.copyright);
        writeDLSInfo("ICRD", toISODateString(info.creationDate));
        writeDLSInfo("IENG", info.engineer);
        writeDLSInfo("IPRD", info.product);
        writeDLSInfo("ISFT", options.software);
        writeDLSInfo("ISBJ", info.subject);

        SpessaLog.info("%cCombining everything...");
        const out = RIFFChunk.writeParts("RIFF", [
            getStringBytes("DLS "),
            colh,
            ...lins,
            ptbl,
            ...wvpl,
            ...RIFFChunk.getParts("INFO", infos, true)
        ]);

        SpessaLog.info("%cSaved successfully!", ConsoleColors.recognized);
        SpessaLog.groupEnd();
        return out.buffer;
    }

    /**
     * Performs a full conversion from DownloadableSounds to BasicSoundBank.
     */
    public toSF(): BasicSoundBank {
        SpessaLog.group("%cConverting DLS to SF2...", ConsoleColors.info);
        const soundBank = new BasicSoundBank("dls");

        soundBank.soundBankInfo.version.minor = 4;
        soundBank.soundBankInfo.version.major = 2;
        soundBank.soundBankInfo = { ...this.soundBankInfo };

        for (const sample of this.samples) {
            sample.toSFSample(soundBank);
        }

        for (const instrument of this.instruments) {
            instrument.toSFPreset(soundBank);
        }
        soundBank.flush();

        SpessaLog.info("%cConversion complete!", ConsoleColors.recognized);
        SpessaLog.groupEnd();
        return soundBank;
    }
}
