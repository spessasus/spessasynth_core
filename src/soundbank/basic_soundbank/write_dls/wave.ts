import { IndexedByteArray } from "../../../utils/indexed_array";
import {
    writeDword,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import { writeRIFFChunkParts, writeRIFFChunkRaw } from "../riff_chunk";
import { writeWavesample } from "./wsmp";
import { SpessaSynthInfo } from "../../../utils/loggin";
import { consoleColors } from "../../../utils/other";
import { getStringBytes } from "../../../utils/byte_functions/string";
import type { BasicSample } from "../basic_sample";

/**
 * Writes a DLS sample.
 */
export function writeDLSSample(sample: BasicSample): IndexedByteArray {
    const fmtData = new IndexedByteArray(18);
    writeWord(fmtData, 1); // wFormatTag
    writeWord(fmtData, 1); // wChannels
    writeDword(fmtData, sample.sampleRate);
    writeDword(fmtData, sample.sampleRate * 2); // 16-bit samples
    writeWord(fmtData, 2); // wBlockAlign
    writeWord(fmtData, 16); // wBitsPerSample
    const fmt = writeRIFFChunkRaw("fmt ", fmtData);
    let loop = 1;
    if (
        sample.sampleLoopStartIndex +
            Math.abs(sample.getAudioData().length - sample.sampleLoopEndIndex) <
        2
    ) {
        loop = 0;
    }
    const wsmp = writeWavesample(
        sample.samplePitch,
        sample.samplePitchCorrection,
        0,
        sample.sampleLoopStartIndex,
        sample.sampleLoopEndIndex,
        loop
    );
    const data = writeRIFFChunkRaw(
        "data",
        sample.getRawData(false) // no vorbis allowed
    );

    const inam = writeRIFFChunkRaw(
        "INAM",
        getStringBytes(sample.sampleName, true)
    );
    const info = writeRIFFChunkRaw("INFO", inam, false, true);
    SpessaSynthInfo(
        `%cSaved %c${sample.sampleName}%c successfully!`,
        consoleColors.recognized,
        consoleColors.value,
        consoleColors.recognized
    );
    return writeRIFFChunkParts("wave", [fmt, wsmp, data, info], true);
}
