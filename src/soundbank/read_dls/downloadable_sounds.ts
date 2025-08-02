import { BasicSoundBank } from "../basic_soundbank/basic_soundbank";
import { IndexedByteArray } from "../../utils/indexed_array";
import {
    SpessaSynthGroup,
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo
} from "../../utils/loggin";
import { consoleColors } from "../../utils/other";
import {
    findRIFFListType,
    readRIFFChunk,
    RIFFChunk
} from "../basic_soundbank/riff_chunk";
import { readBytesAsString } from "../../utils/byte_functions/string";
import { readLittleEndian } from "../../utils/byte_functions/little_endian";
import { readDLSInstrument } from "./read_instrument";
import { readDLSSamples } from "./read_samples";
import type { SoundBankInfoFourCC } from "../types";

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
            SpessaSynthGroupEnd();
            this.parsingError("No data provided!");
            return;
        }

        // Read the main chunk
        const firstChunk = readRIFFChunk(this.dataArray, false);
        this.verifyHeader(firstChunk, "riff");
        this.verifyText(
            readBytesAsString(this.dataArray, 4).toLowerCase(),
            "dls "
        );

        /**
         * Read the list
         */
        const chunks: RIFFChunk[] = [];
        while (this.dataArray.currentIndex < this.dataArray.length) {
            chunks.push(readRIFFChunk(this.dataArray));
        }

        // Mandatory
        this.soundBankInfo.ifil = "2.1"; // Always for dls
        this.soundBankInfo.isng = "E-mu 10K2";

        // Set some defaults
        this.soundBankInfo.INAM = "Unnamed DLS";
        this.soundBankInfo.IENG = "Unknown";
        this.soundBankInfo.IPRD = "SpessaSynth DLS";
        this.soundBankInfo.ICRD = new Date().toDateString();

        // Read info
        const infoChunk = findRIFFListType(chunks, "INFO");
        if (infoChunk) {
            while (
                infoChunk.chunkData.currentIndex < infoChunk.chunkData.length
            ) {
                const infoPart = readRIFFChunk(infoChunk.chunkData);
                (this.soundBankInfo[
                    infoPart.header as SoundBankInfoFourCC
                ] as string) = readBytesAsString(
                    infoPart.chunkData,
                    infoPart.size
                );
            }
        }
        this.soundBankInfo.ICMT = this.soundBankInfo.ICMT ?? "(No description)";
        if (this.soundBankInfo.ISBJ) {
            // Merge it
            this.soundBankInfo.ICMT += "\n" + this.soundBankInfo.ISBJ;
            delete this.soundBankInfo.ISBJ;
        }
        this.soundBankInfo.ICMT +=
            "\nConverted from DLS to SF2 with SpessaSynth";

        for (const [info, value] of Object.entries(this.soundBankInfo)) {
            SpessaSynthInfo(
                `%c"${info}": %c"${value.toString()}"`,
                consoleColors.info,
                consoleColors.recognized
            );
        }

        // Read "colh"
        const colhChunk = chunks.find((c) => c.header === "colh");
        if (!colhChunk) {
            SpessaSynthGroupEnd();
            this.parsingError("No colh chunk!");
            return;
        }
        const instrumentAmount = readLittleEndian(colhChunk.chunkData, 4);
        SpessaSynthInfo(
            `%cInstruments amount: %c${instrumentAmount}`,
            consoleColors.info,
            consoleColors.recognized
        );

        // Read the wave list
        const waveListChunk = findRIFFListType(chunks, "wvpl");
        if (!waveListChunk) {
            SpessaSynthGroupEnd();
            this.parsingError("No wvpl chunk!");
            return;
        }
        readDLSSamples.call(this, waveListChunk);

        // Read the instrument list
        const instrumentListChunk = findRIFFListType(chunks, "lins");
        if (!instrumentListChunk) {
            SpessaSynthGroupEnd();
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
                readRIFFChunk(instrumentListChunk.chunkData)
            );
        }
        SpessaSynthGroupEnd();

        // Sort presets
        this.flush();
        SpessaSynthInfo(
            `%cParsing finished! %c"${this.soundBankInfo.INAM || "UNNAMED"}"%c has %c${this.presets.length} %cpresets,
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
        SpessaSynthGroupEnd();
        this.parsingError(
            `Invalid DLS chunk header! Expected "${expected.toString()}" got "${chunk.header.toLowerCase()}"`
        );
    }

    /**
     * @param text {string}
     * @param expected {string}
     * @throws error if the check doesn't pass
     */
    protected verifyText(text: string, expected: string) {
        if (text.toLowerCase() !== expected.toLowerCase()) {
            SpessaSynthGroupEnd();
            this.parsingError(
                `FourCC error: Expected "${expected.toLowerCase()}" got "${text.toLowerCase()}"`
            );
        }
    }

    /**
     * @throws error if the check doesn't pass
     */
    protected parsingError(error: string) {
        throw new Error(`DLS parse error: ${error} The file may be corrupted.`);
    }
}

export { DownloadableSounds };
