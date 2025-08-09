import {
    writeRIFFChunkParts,
    writeRIFFChunkRaw
} from "../../../utils/riff_chunk";
import { writeDword } from "../../../utils/byte_functions/little_endian";
import { IndexedByteArray } from "../../../utils/indexed_array";
import { getStringBytes } from "../../../utils/byte_functions/string";
import { writeWavePool } from "./wvpl";
import {
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo
} from "../../../utils/loggin";
import { consoleColors } from "../../../utils/other";
import { fillWithDefaults } from "../../../utils/fill_with_defaults";
import type { DLSWriteOptions } from "../../types";
import type { BasicSoundBank } from "../basic_soundbank";
import { writeIns } from "./ins";

export const DEFAULT_DLS_OPTIONS: DLSWriteOptions = {
    progressFunction: undefined
};

/**
 * Write the soundfont as a .dls file. This may not be 100% accurate.
 * @param targetSoundBank {BasicSoundBank}
 * @param {Partial<DLSWriteOptions>} options - options for writing the file.
 * @returns the binary file.
 */
export async function writeDLSInternal(
    targetSoundBank: BasicSoundBank,
    options: Partial<DLSWriteOptions> = DEFAULT_DLS_OPTIONS
): Promise<ArrayBuffer> {
    options = fillWithDefaults(options, DEFAULT_DLS_OPTIONS);
    SpessaSynthGroupCollapsed("%cSaving DLS...", consoleColors.info);
    // Write colh
    const colhNum = new IndexedByteArray(4);
    writeDword(colhNum, targetSoundBank.presets.length);
    const colh = writeRIFFChunkRaw("colh", colhNum);
    SpessaSynthGroupCollapsed("%cWriting instruments...", consoleColors.info);
    // Instrument list
    const lins = writeRIFFChunkParts(
        "lins",
        targetSoundBank.presets.map((p) => writeIns(targetSoundBank, p)),
        true
    );
    SpessaSynthInfo("%cSuccess!", consoleColors.recognized);
    SpessaSynthGroupEnd();

    SpessaSynthGroupCollapsed("%cWriting WAVE samples...", consoleColors.info);
    const wavePool = await writeWavePool(
        targetSoundBank,
        options.progressFunction
    );
    const wvpl = wavePool.data;
    const ptblOffsets = wavePool.indexes;
    SpessaSynthInfo("%cSucceeded!", consoleColors.recognized);
    SpessaSynthGroupEnd();

    // Write ptbl
    const ptblData = new IndexedByteArray(8 + 4 * ptblOffsets.length);
    writeDword(ptblData, 8);
    writeDword(ptblData, ptblOffsets.length);
    for (const offset of ptblOffsets) {
        writeDword(ptblData, offset);
    }
    const ptbl = writeRIFFChunkRaw("ptbl", ptblData);

    targetSoundBank.soundBankInfo.ICMT =
        (targetSoundBank.soundBankInfo.ICMT ?? "<No descrption>") +
        "\nConverted from SF2 to DLS using SpessaSynth";
    targetSoundBank.soundBankInfo.ISFT = "SpessaSynth";
    // Write INFO
    const infos = [];
    for (const [info, data] of Object.entries(targetSoundBank.soundBankInfo)) {
        if (
            info !== "ICMT" &&
            info !== "INAM" &&
            info !== "ICRD" &&
            info !== "IENG" &&
            info !== "ICOP" &&
            info !== "ISFT" &&
            info !== "ISBJ"
        ) {
            continue;
        }
        if (typeof data === "string")
            infos.push(writeRIFFChunkRaw(info, getStringBytes(data, true)));
    }
    const info = writeRIFFChunkParts("INFO", infos, true);
    SpessaSynthInfo("%cSaved successfully!", consoleColors.recognized);
    SpessaSynthGroupEnd();
    return writeRIFFChunkParts("RIFF", [
        getStringBytes("DLS "),
        colh,
        lins,
        ptbl,
        wvpl,
        info
    ]).buffer;
}
