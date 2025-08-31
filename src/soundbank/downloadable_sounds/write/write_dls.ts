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
import type {
    DLSInfoFourCC,
    DLSWriteOptions,
    SoundBankInfoData,
    SoundBankInfoFourCC
} from "../../types";
import type { BasicSoundBank } from "../../basic_soundbank/basic_soundbank";
import { writeIns } from "./ins";

const DEFAULT_DLS_OPTIONS: DLSWriteOptions = {
    progressFunction: undefined
};

/**
 * Write the soundfont as a .dls file. This may not be 100% accurate.
 * @param targetSoundBank
 * @param options - options for writing the file.
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
    targetSoundBank.soundBankInfo.software = "SpessaSynth";
    // Write INFO
    const infos: Uint8Array[] = [];

    const writeDLSInfo = (type: DLSInfoFourCC, data: string) => {
        infos.push(writeRIFFChunkRaw(type, getStringBytes(data, true)));
    };

    for (const [t, d] of Object.entries(targetSoundBank.soundBankInfo)) {
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
