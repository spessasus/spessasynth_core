import { DLSVerifier } from "./dls_verifier";
import { WaveSample } from "./wave_sample";
import {
    findRIFFListType,
    readRIFFChunk,
    type RIFFChunk,
    writeRIFFChunkParts,
    writeRIFFChunkRaw
} from "../../../utils/riff_chunk";
import {
    readLittleEndianIndexed,
    writeDword,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import {
    getStringBytes,
    readBinaryStringIndexed
} from "../../../utils/byte_functions/string";
import { IndexedByteArray } from "../../../utils/indexed_array";
import { SpessaSynthInfo } from "../../../utils/loggin";
import { consoleColors } from "../../../utils/other";

export class DownloadableSoundsSample extends DLSVerifier {
    public waveSample = new WaveSample();
    public readonly wFormatTag: number;
    public readonly bytesPerSample: number;
    public readonly sampleRate: number;
    public readonly dataChunk: RIFFChunk;
    public name = "Unnamed sample";

    public constructor(
        wFormatTag: number,
        bytesPerSample: number,
        sampleRate: number,
        dataChunk: RIFFChunk
    ) {
        super();
        this.wFormatTag = wFormatTag;
        this.bytesPerSample = bytesPerSample;
        this.sampleRate = sampleRate;
        this.dataChunk = dataChunk;
    }

    public static read(waveChunk: RIFFChunk) {
        const chunks = this.verifyAndReadList(waveChunk, "wave");

        const fmtChunk = chunks.find((c) => c.header === "fmt ");
        if (!fmtChunk) {
            throw new Error("No fmt chunk in the wave file!");
        }

        // https://github.com/tpn/winsdk-10/blob/9b69fd26ac0c7d0b83d378dba01080e93349c2ed/Include/10.0.14393.0/shared/mmreg.h#L2108
        const wFormatTag = readLittleEndianIndexed(fmtChunk.data, 2);
        const channelsAmount = readLittleEndianIndexed(fmtChunk.data, 2);
        if (channelsAmount !== 1) {
            throw new Error(
                `Only mono samples are supported. Fmt reports ${channelsAmount} channels.`
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
        const dataChunk = chunks.find((c) => c.header === "data");
        if (!dataChunk) {
            throw new Error("No data chunk in the WAVE chunk!");
        }
        const sample = new DownloadableSoundsSample(
            wFormatTag,
            bytesPerSample,
            sampleRate,
            dataChunk
        );

        // Read sample name
        const waveInfo = findRIFFListType(chunks, "INFO");
        if (waveInfo) {
            let infoChunk = readRIFFChunk(waveInfo.data);
            while (
                infoChunk.header !== "INAM" &&
                waveInfo.data.currentIndex < waveInfo.data.length
            ) {
                infoChunk = readRIFFChunk(waveInfo.data);
            }
            if (infoChunk.header === "INAM") {
                sample.name = readBinaryStringIndexed(
                    infoChunk.data,
                    infoChunk.size
                ).trim();
            }
        }

        // Read wave sample
        const wsmpChunk = chunks.find((c) => c.header === "wsmp");
        if (wsmpChunk) {
            sample.waveSample = WaveSample.read(wsmpChunk);
        }
        return sample;
    }

    public write() {
        const fmt = this.writeFmt();
        const wsmp = this.waveSample.write();
        const data = writeRIFFChunkRaw("data", this.dataChunk.data);

        const inam = writeRIFFChunkRaw("INAM", getStringBytes(this.name, true));
        const info = writeRIFFChunkRaw("INFO", inam, false, true);
        SpessaSynthInfo(
            `%cSaved %c${this.name}%c successfully!`,
            consoleColors.recognized,
            consoleColors.value,
            consoleColors.recognized
        );
        return writeRIFFChunkParts("wave", [fmt, wsmp, data, info], true);
    }

    private writeFmt() {
        const fmtData = new IndexedByteArray(18);
        writeWord(fmtData, this.wFormatTag); // WFormatTag
        writeWord(fmtData, 1); // WChannels
        writeDword(fmtData, this.sampleRate);
        writeDword(fmtData, this.sampleRate * 2); // 16-bit samples
        writeWord(fmtData, 2); // WBlockAlign
        writeWord(fmtData, this.bytesPerSample * 8); // WBitsPerSample
        return writeRIFFChunkRaw("fmt ", fmtData);
    }
}
