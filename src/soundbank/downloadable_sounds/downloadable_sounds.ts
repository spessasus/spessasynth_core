import { DLSVerifier } from "./dls_verifier";
import { DownloadableSoundsSample } from "./sample";
import { DownloadableSoundsInstrument } from "./instrument";
import type {
    DLSInfoFourCC,
    DLSWriteOptions,
    SF2VersionTag,
    SoundBankInfoData,
    SoundBankInfoFourCC
} from "../types";
import { IndexedByteArray } from "../../utils/indexed_array";
import { consoleColors } from "../../utils/other";
import {
    findRIFFListType,
    readRIFFChunk,
    RIFFChunk,
    writeRIFFChunkParts,
    writeRIFFChunkRaw
} from "../../utils/riff_chunk";
import {
    getStringBytes,
    readBinaryStringIndexed
} from "../../utils/byte_functions/string";
import { parseDateString } from "../../utils/load_date";
import {
    readLittleEndianIndexed,
    writeDword
} from "../../utils/byte_functions/little_endian";
import {
    SpessaSynthGroup,
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo,
    SpessaSynthWarn
} from "../../utils/loggin";
import { BasicSoundBank } from "../basic_soundbank/basic_soundbank";
import { BankSelectHacks } from "../../utils/midi_hacks";
import { DownloadableSoundsRegion } from "./region";

export const DEFAULT_DLS_OPTIONS: DLSWriteOptions = {
    progressFunction: undefined
};

export class DownloadableSounds extends DLSVerifier {
    public readonly samples = new Array<DownloadableSoundsSample>();
    public readonly instruments = new Array<DownloadableSoundsInstrument>();
    public soundBankInfo: SoundBankInfoData = {
        name: "Unnamed",
        creationDate: new Date(),
        software: "SpessaSynth",
        soundEngine: "DLS Level 2.2",
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
        SpessaSynthGroup("%cParsing DLS file...", consoleColors.info);

        // Read the main chunk
        const firstChunk = readRIFFChunk(dataArray, false);
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
            chunks.push(readRIFFChunk(dataArray));
        }

        const dls = new DownloadableSounds();

        // Set some defaults
        dls.soundBankInfo.name = "Unnamed DLS";
        dls.soundBankInfo.product = "SpessaSynth DLS";
        dls.soundBankInfo.comment = "(no description)";

        // Read info
        const infoChunk = findRIFFListType(chunks, "INFO");
        if (infoChunk) {
            while (infoChunk.data.currentIndex < infoChunk.data.length) {
                const infoPart = readRIFFChunk(infoChunk.data);
                const headerTyped = infoPart.header as DLSInfoFourCC;
                const text = readBinaryStringIndexed(
                    infoPart.data,
                    infoPart.size
                );
                switch (headerTyped) {
                    case "INAM":
                        dls.soundBankInfo.name = text;
                        break;

                    case "ICRD":
                        dls.soundBankInfo.creationDate = parseDateString(text);
                        break;

                    case "ICMT":
                        dls.soundBankInfo.comment = text;
                        break;

                    case "ISBJ":
                        dls.soundBankInfo.subject = text;
                        break;

                    case "ICOP":
                        dls.soundBankInfo.copyright = text;
                        break;

                    case "IENG":
                        dls.soundBankInfo.engineer = text;
                        break;

                    case "IPRD":
                        dls.soundBankInfo.product = text;
                        break;

                    case "ISFT":
                        dls.soundBankInfo.software = text;
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
        SpessaSynthInfo(
            `%cInstruments amount: %c${instrumentAmount}`,
            consoleColors.info,
            consoleColors.recognized
        );

        // Read the wave list
        const waveListChunk = findRIFFListType(chunks, "wvpl");
        if (!waveListChunk) {
            this.parsingError("No wvpl chunk!");
            return 5 as never;
        }
        const waveList = this.verifyAndReadList(waveListChunk, "wvpl");
        waveList.forEach((wave) => {
            dls.samples.push(DownloadableSoundsSample.read(wave));
        });

        // Read the instrument list
        const instrumentListChunk = findRIFFListType(chunks, "lins");
        if (!instrumentListChunk) {
            this.parsingError("No lins chunk!");
            return 5 as never;
        }
        const instruments = this.verifyAndReadList(instrumentListChunk, "lins");
        SpessaSynthGroupCollapsed(
            "%cLoading instruments...",
            consoleColors.info
        );
        if (instruments.length !== instrumentAmount) {
            SpessaSynthWarn(
                `Colh reported invalid amount of instruments. Detected ${instruments.length}, expected ${instrumentAmount}`
            );
        }
        instruments.forEach((ins) => {
            dls.instruments.push(
                DownloadableSoundsInstrument.read(dls.samples, ins)
            );
        });
        SpessaSynthGroupEnd();

        /*
         MobileBAE Instrument aliasing
         https://github.com/spessasus/spessasynth_core/issues/14
         https://lpcwiki.miraheze.org/wiki/MobileBAE#Proprietary_instrument_aliasing_chunk
         http://onj3.andrelouis.com/phonetones/Software%20and%20Soundbanks/Soundbanks/Beatnik%20mobileBAE/
        */
        const aliasingChunk = chunks.find((c) => c.header === "pgal");
        if (aliasingChunk) {
            SpessaSynthInfo(
                "%cFound the instrument aliasing chunk!",
                consoleColors.recognized
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
                (i) => BankSelectHacks.isXGDrums(i.bankMSB) || i.isGMGSDrum
            );
            if (!drumInstrument) {
                SpessaSynthWarn(
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
                    SpessaSynthWarn(
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
                    SpessaSynthWarn(
                        `Invalid alias byte. Expected 0, got ${nullByte}`
                    );
                }
                const inputBankNum = readLittleEndianIndexed(pgalData, 2);
                const inputBankLSB = inputBankNum & 0x7f;
                const inputBankMSB = (inputBankNum >> 7) & 0x7f;
                const inputProgram = pgalData[pgalData.currentIndex++];
                nullByte = pgalData[pgalData.currentIndex++];
                if (nullByte !== 0) {
                    SpessaSynthWarn(
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
                    SpessaSynthWarn(
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

        SpessaSynthInfo(
            `%cParsing finished! %c"${dls.soundBankInfo.name || "UNNAMED"}"%c has %c${dls.instruments.length}%c instruments and %c${dls.samples.length}%c samples.`,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info
        );
        SpessaSynthGroupEnd();
        return dls;
    }

    /**
     * Performs a full conversion from BasicSoundBank to DownloadableSounds.
     */
    public static fromSF(bank: BasicSoundBank) {
        SpessaSynthGroupCollapsed(
            "%cSaving SF2 to DLS level 2...",
            consoleColors.info
        );
        const dls = new DownloadableSounds();
        dls.soundBankInfo = { ...bank.soundBankInfo };
        dls.soundBankInfo.comment =
            (dls.soundBankInfo.comment ?? "(No description)") +
            "\nConverted from SF2 to DLS with SpessaSynth";

        bank.samples.forEach((s) => {
            dls.samples.push(DownloadableSoundsSample.fromSFSample(s));
        });
        bank.presets.forEach((p) => {
            dls.instruments.push(
                DownloadableSoundsInstrument.fromSFPreset(p, bank.samples)
            );
        });

        SpessaSynthInfo("%cConversion complete!", consoleColors.recognized);
        SpessaSynthGroupEnd();
        return dls;
    }

    private static printInfo(dls: DownloadableSounds) {
        for (const [info, value] of Object.entries(dls.soundBankInfo)) {
            if (typeof value === "object" && "major" in value) {
                const v = value as SF2VersionTag;
                SpessaSynthInfo(
                    `%c${info}: %c"${v.major}.${v.minor}"`,
                    consoleColors.info,
                    consoleColors.recognized
                );
            }
            SpessaSynthInfo(
                `%c${info}: %c${(value as string | Date).toLocaleString()}`,
                consoleColors.info,
                consoleColors.recognized
            );
        }
    }

    /**
     * Writes an SF2 file
     * @param options
     */
    public async write(options: DLSWriteOptions = DEFAULT_DLS_OPTIONS) {
        SpessaSynthGroupCollapsed("%cSaving DLS...", consoleColors.info);
        // Write colh
        const colhNum = new IndexedByteArray(4);
        writeDword(colhNum, this.instruments.length);
        const colh = writeRIFFChunkRaw("colh", colhNum);
        SpessaSynthGroupCollapsed(
            "%cWriting instruments...",
            consoleColors.info
        );

        const lins = writeRIFFChunkParts(
            "lins",
            this.instruments.map((i) => i.write()),
            true
        );
        SpessaSynthInfo("%cSuccess!", consoleColors.recognized);
        SpessaSynthGroupEnd();

        SpessaSynthGroupCollapsed(
            "%cWriting WAVE samples...",
            consoleColors.info
        );

        let currentIndex = 0;
        const ptblOffsets = [];
        const samples: IndexedByteArray[] = [];
        let written = 0;
        for (const s of this.samples) {
            const out = s.write();
            await options?.progressFunction?.(
                s.name,
                written,
                this.samples.length
            );
            ptblOffsets.push(currentIndex);
            currentIndex += out.length;
            samples.push(out);
            written++;
        }
        const wvpl = writeRIFFChunkParts("wvpl", samples, true);
        SpessaSynthInfo("%cSucceeded!", consoleColors.recognized);

        // Write ptbl
        const ptblData = new IndexedByteArray(8 + 4 * ptblOffsets.length);
        writeDword(ptblData, 8);
        writeDword(ptblData, ptblOffsets.length);
        for (const offset of ptblOffsets) {
            writeDword(ptblData, offset);
        }
        const ptbl = writeRIFFChunkRaw("ptbl", ptblData);
        this.soundBankInfo.software = "SpessaSynth"; // ( ͡° ͜ʖ ͡°)

        // Write INFO
        const infos: Uint8Array[] = [];

        const writeDLSInfo = (type: DLSInfoFourCC, data: string) => {
            infos.push(writeRIFFChunkRaw(type, getStringBytes(data, true)));
        };

        for (const [t, d] of Object.entries(this.soundBankInfo)) {
            const type = t as SoundBankInfoFourCC;
            const data = d as SoundBankInfoData[SoundBankInfoFourCC];
            if (!data) {
                continue;
            }
            switch (type) {
                case "name":
                    writeDLSInfo("INAM", data as string);
                    break;

                case "comment":
                    writeDLSInfo("ICMT", data as string);
                    break;

                case "copyright":
                    writeDLSInfo("ICOP", data as string);
                    break;

                case "creationDate":
                    writeDLSInfo("ICRD", (data as Date).toISOString());
                    break;

                case "engineer":
                    writeDLSInfo("IENG", data as string);
                    break;

                case "product":
                    writeDLSInfo("IPRD", data as string);
                    break;

                case "romVersion":
                case "version":
                case "soundEngine":
                case "romInfo":
                    // Not writable
                    break;

                case "software":
                    writeDLSInfo("ISFT", data as string);
                    break;

                case "subject":
                    writeDLSInfo("ISBJ", data as string);
            }
        }
        const info = writeRIFFChunkParts("INFO", infos, true);

        SpessaSynthInfo("%cCombining everything...");
        const out = writeRIFFChunkParts("RIFF", [
            getStringBytes("DLS "),
            colh,
            lins,
            ptbl,
            wvpl,
            info
        ]);

        SpessaSynthInfo("%cSaved successfully!", consoleColors.recognized);
        SpessaSynthGroupEnd();
        return out.buffer;
    }

    /**
     * Performs a full conversion from DownloadableSounds to BasicSoundBank.
     */
    public toSF(): BasicSoundBank {
        SpessaSynthGroup("%cConverting DLS to SF2...", consoleColors.info);
        const soundBank = new BasicSoundBank();

        soundBank.soundBankInfo.version.minor = 4;
        soundBank.soundBankInfo.version.major = 2;
        soundBank.soundBankInfo = { ...this.soundBankInfo };
        soundBank.soundBankInfo.comment =
            (soundBank.soundBankInfo.comment ?? "(No description)") +
            "\nConverted from DLS to SF2 with SpessaSynth";

        this.samples.forEach((sample) => {
            sample.toSFSample(soundBank);
        });

        this.instruments.forEach((instrument) => {
            instrument.toSFPreset(soundBank);
        });
        soundBank.flush();

        SpessaSynthInfo("%cConversion complete!", consoleColors.recognized);
        SpessaSynthGroupEnd();
        return soundBank;
    }
}
