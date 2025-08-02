import {
    findRIFFListType,
    readRIFFChunk,
    RIFFChunk
} from "../../utils/riff_chunk";
import { readBinaryStringIndexed } from "../../utils/byte_functions/string";
import {
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo,
    SpessaSynthWarn
} from "../../utils/loggin";
import { consoleColors } from "../../utils/other";
import {
    readLittleEndianIndexed,
    signedInt16
} from "../../utils/byte_functions/little_endian";
import { DLSSample } from "./dls_sample";
import type { DownloadableSounds } from "./downloadable_sounds";

export function readDLSSamples(
    this: DownloadableSounds,
    waveListChunk: RIFFChunk
) {
    SpessaSynthGroupCollapsed(
        "%cLoading Wave samples...",
        consoleColors.recognized
    );
    let sampleID = 0;
    while (waveListChunk.data.currentIndex < waveListChunk.data.length) {
        const waveChunk = readRIFFChunk(waveListChunk.data);
        this.verifyHeader(waveChunk, "LIST");
        this.verifyText(readBinaryStringIndexed(waveChunk.data, 4), "wave");

        const waveChunks: RIFFChunk[] = [];
        while (waveChunk.data.currentIndex < waveChunk.data.length) {
            waveChunks.push(readRIFFChunk(waveChunk.data));
        }

        const fmtChunk = waveChunks.find((c) => c.header === "fmt ");
        if (!fmtChunk) {
            throw new Error("No fmt chunk in the wave file!");
        }
        // https://github.com/tpn/winsdk-10/blob/9b69fd26ac0c7d0b83d378dba01080e93349c2ed/Include/10.0.14393.0/shared/mmreg.h#L2108
        const wFormatTag = readLittleEndianIndexed(fmtChunk.data, 2);
        const channelsAmount = readLittleEndianIndexed(fmtChunk.data, 2);
        if (channelsAmount !== 1) {
            throw new Error(
                `Only mono samples are supported. Fmt reports ${channelsAmount} channels`
            );
        }
        const sampleRate = readLittleEndianIndexed(fmtChunk.data, 4);
        // Skip avg bytes
        readLittleEndianIndexed(fmtChunk.data, 4);
        // BlockAlign
        readLittleEndianIndexed(fmtChunk.data, 2);
        // It's bits per sample because one channel
        const wBitsPerSample = readLittleEndianIndexed(fmtChunk.data, 2);
        const bytesPerSample = wBitsPerSample / 8;

        const dataChunk = waveChunks.find((c) => c.header === "data");
        if (!dataChunk) {
            this.parsingError("No data chunk in the WAVE chunk!");
            return;
        }

        // Read sample name
        const waveInfo = findRIFFListType(waveChunks, "INFO");
        let sampleName = `Unnamed ${sampleID}`;
        if (waveInfo) {
            let infoChunk = readRIFFChunk(waveInfo.data);
            while (
                infoChunk.header !== "INAM" &&
                waveInfo.data.currentIndex < waveInfo.data.length
            ) {
                infoChunk = readRIFFChunk(waveInfo.data);
            }
            if (infoChunk.header === "INAM") {
                sampleName = readBinaryStringIndexed(
                    infoChunk.data,
                    infoChunk.size
                ).trim();
            }
        }

        // Correct defaults
        let sampleKey = 60;
        let samplePitch = 0;
        let sampleLoopStart = 0;
        const sampleLength = dataChunk.size / bytesPerSample;
        let sampleLoopEnd = sampleLength - 1;
        let sampleDbAttenuation = 0;

        // Read wsmp
        const wsmpChunk = waveChunks.find((c) => c.header === "wsmp");
        if (wsmpChunk) {
            // Skip cbsize
            readLittleEndianIndexed(wsmpChunk.data, 4);
            sampleKey = readLittleEndianIndexed(wsmpChunk.data, 2);
            // Section 1.14.2: Each relative pitch unit represents 1/65536 cents.
            // But that doesn't seem true for this one: it's just cents.
            samplePitch = signedInt16(
                wsmpChunk.data[wsmpChunk.data.currentIndex++],
                wsmpChunk.data[wsmpChunk.data.currentIndex++]
            );

            // Pitch correction: convert hundreds to the root key
            const samplePitchSemitones = Math.trunc(samplePitch / 100);
            sampleKey += samplePitchSemitones;
            samplePitch -= samplePitchSemitones * 100;

            // Gain is applied it manually here (literally multiplying the samples)
            const gainCorrection = readLittleEndianIndexed(wsmpChunk.data, 4);
            // Convert to signed and turn into decibels
            sampleDbAttenuation = (gainCorrection | 0) / -655360;
            // No idea about ful options
            readLittleEndianIndexed(wsmpChunk.data, 4);
            const loopsAmount = readLittleEndianIndexed(wsmpChunk.data, 4);
            if (loopsAmount === 1) {
                // Skip size and type
                readLittleEndianIndexed(wsmpChunk.data, 8);
                sampleLoopStart = readLittleEndianIndexed(wsmpChunk.data, 4);
                const loopSize = readLittleEndianIndexed(wsmpChunk.data, 4);
                sampleLoopEnd = sampleLoopStart + loopSize;
            }
        } else {
            SpessaSynthWarn("No wsmp chunk in wave... using sane defaults.");
        }

        this.addSamples(
            new DLSSample(
                sampleName,
                sampleRate,
                sampleKey,
                samplePitch,
                sampleLoopStart,
                sampleLoopEnd,
                sampleDbAttenuation,
                dataChunk,
                wFormatTag,
                bytesPerSample
            )
        );

        sampleID++;
        SpessaSynthInfo(
            `%cLoaded sample %c${sampleName}`,
            consoleColors.info,
            consoleColors.recognized
        );
    }
    SpessaSynthGroupEnd();
}
