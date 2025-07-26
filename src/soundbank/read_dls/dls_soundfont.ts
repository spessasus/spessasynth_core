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
    RiffChunk
} from "../basic_soundbank/riff_chunk";
import { readBytesAsString } from "../../utils/byte_functions/string";
import { readLittleEndian } from "../../utils/byte_functions/little_endian";
import { readDLSInstrument } from "./read_instrument";
import { readDLSSamples } from "./read_samples";
import type { SoundFontInfoFourCC } from "../types";

class DownloadableSounds extends BasicSoundBank {
    // main array that we read from
    dataArray: IndexedByteArray;

    /**
     * Loads a new DLS (Downloadable sounds) soundfont
     */
    constructor(buffer: ArrayBuffer) {
        super();
        this.dataArray = new IndexedByteArray(buffer);
        SpessaSynthGroup("%cParsing DLS...", consoleColors.info);
        if (!this.dataArray) {
            SpessaSynthGroupEnd();
            this.parsingError("No data provided!");
        }

        // read the main chunk
        const firstChunk = readRIFFChunk(this.dataArray, false);
        this.verifyHeader(firstChunk, "riff");
        this.verifyText(
            readBytesAsString(this.dataArray, 4).toLowerCase(),
            "dls "
        );

        /**
         * Read the list
         */
        const chunks: RiffChunk[] = [];
        while (this.dataArray.currentIndex < this.dataArray.length) {
            chunks.push(readRIFFChunk(this.dataArray));
        }

        // mandatory
        this.soundFontInfo["ifil"] = "2.1"; // always for dls
        this.soundFontInfo["isng"] = "E-mu 10K2";

        // set some defaults
        this.soundFontInfo["INAM"] = "Unnamed DLS";
        this.soundFontInfo["IENG"] = "Unknown";
        this.soundFontInfo["IPRD"] = "SpessaSynth DLS";
        this.soundFontInfo["ICRD"] = new Date().toDateString();

        // read info
        const infoChunk = findRIFFListType(chunks, "INFO");
        if (infoChunk) {
            while (
                infoChunk.chunkData.currentIndex < infoChunk.chunkData.length
            ) {
                const infoPart = readRIFFChunk(infoChunk.chunkData);
                this.soundFontInfo[infoPart.header as SoundFontInfoFourCC] =
                    readBytesAsString(infoPart.chunkData, infoPart.size);
            }
        }
        this.soundFontInfo["ICMT"] =
            this.soundFontInfo["ICMT"] || "(No description)";
        if (this.soundFontInfo["ISBJ"]) {
            // merge it
            this.soundFontInfo["ICMT"] += "\n" + this.soundFontInfo["ISBJ"];
            delete this.soundFontInfo["ISBJ"];
        }
        this.soundFontInfo["ICMT"] +=
            "\nConverted from DLS to SF2 with SpessaSynth";

        for (const [info, value] of Object.entries(this.soundFontInfo)) {
            SpessaSynthInfo(
                `%c"${info}": %c"${value}"`,
                consoleColors.info,
                consoleColors.recognized
            );
        }

        // read "colh"
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

        // read the wave list
        const waveListChunk = findRIFFListType(chunks, "wvpl");
        if (!waveListChunk) {
            SpessaSynthGroupEnd();
            this.parsingError("No wvpl chunk!");
            return;
        }
        readDLSSamples(this, waveListChunk);

        // read the instrument list
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
            readDLSInstrument(
                this,
                readRIFFChunk(instrumentListChunk.chunkData)
            );
        }
        SpessaSynthGroupEnd();

        // sort presets
        this.flush();
        SpessaSynthInfo(
            `%cParsing finished! %c"${this.soundFontInfo["INAM"] || "UNNAMED"}"%c has %c${this.presets.length} %cpresets,
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

    /**
     * @param chunk
     * @param expected
     * @throws error if the check doesn't pass
     */
    verifyHeader(chunk: RiffChunk, ...expected: string[]) {
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
    verifyText(text: string, expected: string) {
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
    parsingError(error: string) {
        throw new Error(`DLS parse error: ${error} The file may be corrupted.`);
    }

    destroySoundBank() {
        super.destroySoundBank();
        this.dataArray = new IndexedByteArray(0);
    }
}

export { DownloadableSounds };
