import { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import { IndexedByteArray } from "../../../utils/indexed_array";
import {
    SpessaSynthGroup,
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo
} from "../../../utils/loggin";
import { consoleColors } from "../../../utils/other";
import {
    findRIFFListType,
    readRIFFChunk,
    RIFFChunk,
    type WAVFourCC
} from "../../../utils/riff_chunk";
import { readBinaryStringIndexed } from "../../../utils/byte_functions/string";
import { readLittleEndianIndexed } from "../../../utils/byte_functions/little_endian";
import { readDLSInstrument } from "./read_instrument";
import { readDLSSamples } from "./read_samples";
import type { DLSChunkFourCC, DLSInfoFourCC } from "../../types";
import { parseDateString } from "../../../utils/load_date";

class DownloadableSounds extends BasicSoundBank {
    // Main array that we read from
    protected dataArray: IndexedByteArray;

    /**
     * Loads a new DLS (Downloadable sounds) soundfont
     */
    public constructor(buffer: ArrayBuffer) {
        super();
        this.dataArray = new IndexedByteArray(buffer);
        SpessaSynthGroup("%cParsing DLS file...", consoleColors.info);
        if (!this.dataArray) {
            this.parsingError("No data provided!");
            return;
        }

        // Read the main chunk
        const firstChunk = readRIFFChunk(this.dataArray, false);
        this.verifyHeader(firstChunk, "riff");
        this.verifyText(
            readBinaryStringIndexed(this.dataArray, 4).toLowerCase(),
            "dls "
        );

        /**
         * Read the list
         */
        const chunks: RIFFChunk[] = [];
        while (this.dataArray.currentIndex < this.dataArray.length) {
            chunks.push(readRIFFChunk(this.dataArray));
        }

        // Set some defaults
        this.soundBankInfo.name = "Unnamed DLS";
        this.soundBankInfo.product = "SpessaSynth DLS";
        this.soundBankInfo.comment = "";

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
                        this.soundBankInfo.name = text;
                        break;

                    case "ICRD":
                        this.soundBankInfo.creationDate = parseDateString(text);
                        break;

                    case "ICMT":
                        this.soundBankInfo.comment = text;
                        break;

                    case "ISBJ":
                        this.soundBankInfo.subject = text;
                        break;

                    case "ICOP":
                        this.soundBankInfo.copyright = text;
                        break;

                    case "IENG":
                        this.soundBankInfo.engineer = text;
                        break;

                    case "IPRD":
                        this.soundBankInfo.product = text;
                        break;

                    case "ISFT":
                        this.soundBankInfo.software = text;
                }
            }
        }
        this.soundBankInfo.comment =
            this.soundBankInfo.comment ?? "(No description)";
        this.soundBankInfo.comment +=
            "\nConverted from DLS to SF2 with SpessaSynth";

        this.printInfo();

        // Read "colh"
        const colhChunk = chunks.find((c) => c.header === "colh");
        if (!colhChunk) {
            this.parsingError("No colh chunk!");
            return;
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
            return;
        }
        readDLSSamples.call(this, waveListChunk);

        // Read the instrument list
        const instrumentListChunk = findRIFFListType(chunks, "lins");
        if (!instrumentListChunk) {
            this.parsingError("No lins chunk!");
            return;
        }
        SpessaSynthGroupCollapsed(
            "%cLoading instruments...",
            consoleColors.info
        );
        for (let i = 0; i < instrumentAmount; i++) {
            readDLSInstrument.call(
                this,
                readRIFFChunk(instrumentListChunk.data)
            );
        }
        SpessaSynthGroupEnd();

        // Sort presets
        this.flush();
        SpessaSynthInfo(
            `%cParsing finished! %c"${this.soundBankInfo.name || "UNNAMED"}"%c has %c${this.presets.length} %cpresets,
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

    public destroySoundBank() {
        super.destroySoundBank();
        this.dataArray = new IndexedByteArray(0);
    }

    /**
     * @param chunk
     * @param expected
     * @throws error if the check doesn't pass
     */
    protected verifyHeader(chunk: RIFFChunk, ...expected: string[]) {
        for (const expect of expected) {
            if (chunk.header.toLowerCase() === expect.toLowerCase()) {
                return;
            }
        }
        this.parsingError(
            `Invalid DLS chunk header! Expected "${expected.toString()}" got "${chunk.header.toLowerCase()}"`
        );
    }

    /**
     * @param text {string}
     * @param expected {string}
     * @throws error if the check doesn't pass
     */
    protected verifyText(text: string, expected: DLSChunkFourCC | WAVFourCC) {
        if (text.toLowerCase() !== expected.toLowerCase()) {
            this.parsingError(
                `FourCC error: Expected "${expected.toLowerCase()}" got "${text.toLowerCase()}"`
            );
        }
    }

    /**
     * @throws error if the check doesn't pass
     */
    protected parsingError(error: string) {
        SpessaSynthGroupEnd();
        throw new Error(`DLS parse error: ${error} The file may be corrupted.`);
    }
}

export { DownloadableSounds };
