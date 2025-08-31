import { DLSVerifier } from "./dls_verifier";
import { DownloadableSoundsSample } from "./sample";
import { DownloadableSoundsInstrument } from "./instrument";
import type {
    DLSInfoFourCC,
    SF2VersionTag,
    SoundBankInfoData
} from "../../types";
import { IndexedByteArray } from "../../../utils/indexed_array";
import { consoleColors } from "../../../utils/other";
import {
    findRIFFListType,
    readRIFFChunk,
    RIFFChunk
} from "../../../utils/riff_chunk";
import { readBinaryStringIndexed } from "../../../utils/byte_functions/string";
import { parseDateString } from "../../../utils/load_date";
import { readLittleEndianIndexed } from "../../../utils/byte_functions/little_endian";
import {
    SpessaSynthGroup,
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo,
    SpessaSynthWarn
} from "../../../utils/loggin";
import { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";

export class DownloadableSounds extends DLSVerifier {
    public readonly samples = new Array<DownloadableSoundsSample>();
    public readonly instruments = new Array<DownloadableSoundsInstrument>();
    public readonly soundBankInfo: SoundBankInfoData = {
        name: "Unnamed",
        creationDate: new Date(),
        software: "SpessaSynth",
        soundEngine: "E-mu 10K2",
        version: {
            major: 2,
            minor: 4
        }
    };

    public static read(buffer: ArrayBuffer) {
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

    public toSF(): BasicSoundBank {
        SpessaSynthGroup("%cConverting DLS to SF2...", consoleColors.info);
        const dls = new BasicSoundBank();

        dls.soundBankInfo.version.minor = 4;
        dls.soundBankInfo.version.major = 2;
        dls.soundBankInfo = { ...this.soundBankInfo };
        dls.soundBankInfo.comment =
            (dls.soundBankInfo.comment ?? "(No description)") +
            "\nConverted from DLS to SF2 with SpessaSynth";

        this.samples.forEach((sample) => {
            sample.toSFSample(dls);
        });

        this.instruments.forEach((instrument) => {
            instrument.toSFPreset(dls);
        });

        SpessaSynthGroupEnd();
        return dls;
    }
}
