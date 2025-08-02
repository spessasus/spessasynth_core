import { IndexedByteArray } from "./indexed_array";
import { writeStringAsBytes } from "./byte_functions/string";
import {
    writeRIFFChunkParts,
    writeRIFFChunkRaw
} from "../soundbank/basic_soundbank/riff_chunk";
import { writeLittleEndian } from "./byte_functions/little_endian";

interface WaveMetadata {
    // The song's title.
    title: string;
    // The song's artist.
    artist: string;
    // The song's album.
    album: string;
    // The song's genre.
    genre: string;
}

/**
 * Writes an audio into a valid WAV file.
 * @param audioData the audio data channels.
 * @param sampleRate the sample rate, in Hertz.
 * @param normalizeAudio this will find the max sample point and set it to 1, and scale others with it. Recommended
 * @param metadata the metadata to write into the file.
 * @param loop the loop start and end points in seconds. Undefined if no loop should be written.
 * @returns the binary file.
 */
export function audioToWav(
    audioData: Float32Array[],
    sampleRate: number,
    normalizeAudio = true,
    metadata: Partial<WaveMetadata> = {},
    loop: { start: number; end: number } | undefined = undefined
): ArrayBuffer {
    const length = audioData[0].length;
    const numChannels = audioData.length;

    const bytesPerSample = 2; // 16-bit PCM

    // Prepare INFO chunk
    let infoChunk = new IndexedByteArray(0);
    const infoOn = Object.keys(metadata).length > 0;
    // INFO chunk
    if (infoOn) {
        const encoder = new TextEncoder();
        const infoChunks = [
            writeRIFFChunkRaw(
                "ICMT",
                encoder.encode("Created with SpessaSynth"),
                true
            )
        ];
        if (metadata.artist) {
            infoChunks.push(
                writeRIFFChunkRaw("IART", encoder.encode(metadata.artist), true)
            );
        }
        if (metadata.album) {
            infoChunks.push(
                writeRIFFChunkRaw("IPRD", encoder.encode(metadata.album), true)
            );
        }
        if (metadata.genre) {
            infoChunks.push(
                writeRIFFChunkRaw("IGNR", encoder.encode(metadata.genre), true)
            );
        }
        if (metadata.title) {
            infoChunks.push(
                writeRIFFChunkRaw("INAM", encoder.encode(metadata.title), true)
            );
        }
        infoChunk = writeRIFFChunkParts("INFO", infoChunks, true);
    }

    // Prepare CUE chunk
    let cueChunk = new IndexedByteArray(0);
    const cueOn = loop?.end !== undefined && loop?.start !== undefined;
    if (cueOn) {
        const loopStartSamples = Math.floor(loop.start * sampleRate);
        const loopEndSamples = Math.floor(loop.end * sampleRate);

        const cueStart = new IndexedByteArray(24);
        writeLittleEndian(cueStart, 0, 4); // DwIdentifier
        writeLittleEndian(cueStart, 0, 4); // DwPosition
        writeStringAsBytes(cueStart, "data"); // Cue point ID
        writeLittleEndian(cueStart, 0, 4); // ChunkStart, always 0
        writeLittleEndian(cueStart, 0, 4); // BlockStart, always 0
        writeLittleEndian(cueStart, loopStartSamples, 4); // SampleOffset

        const cueEnd = new IndexedByteArray(24);
        writeLittleEndian(cueEnd, 1, 4); // DwIdentifier
        writeLittleEndian(cueEnd, 0, 4); // DwPosition
        writeStringAsBytes(cueEnd, "data"); // Cue point ID
        writeLittleEndian(cueEnd, 0, 4); // ChunkStart, always 0
        writeLittleEndian(cueEnd, 0, 4); // BlockStart, always 0
        writeLittleEndian(cueEnd, loopEndSamples, 4); // SampleOffset

        cueChunk = writeRIFFChunkParts("cue ", [
            new IndexedByteArray([2, 0, 0, 0]), // Cue points count
            cueStart,
            cueEnd
        ]);
    }

    // Prepare the header
    const headerSize = 44;
    const dataSize = length * numChannels * bytesPerSample; // 16-bit per channel
    const fileSize =
        headerSize + dataSize + infoChunk.length + cueChunk.length - 8; // Total file size minus the first 8 bytes
    const header = new Uint8Array(headerSize);

    // 'RIFF'
    header.set([82, 73, 70, 70], 0);
    // File length
    header.set(
        new Uint8Array([
            fileSize & 0xff,
            (fileSize >> 8) & 0xff,
            (fileSize >> 16) & 0xff,
            (fileSize >> 24) & 0xff
        ]),
        4
    );
    // 'WAVE'
    header.set([87, 65, 86, 69], 8);
    // 'fmt '
    header.set([102, 109, 116, 32], 12);
    // Fmt chunk length
    header.set([16, 0, 0, 0], 16); // 16 for PCM
    // Audio format (PCM)
    header.set([1, 0], 20);
    // Number of channels (2)
    header.set([numChannels & 255, numChannels >> 8], 22);
    // Sample rate
    header.set(
        new Uint8Array([
            sampleRate & 0xff,
            (sampleRate >> 8) & 0xff,
            (sampleRate >> 16) & 0xff,
            (sampleRate >> 24) & 0xff
        ]),
        24
    );
    // Byte rate (sample rate * block align)
    const byteRate = sampleRate * numChannels * bytesPerSample; // 16-bit per channel
    header.set(
        new Uint8Array([
            byteRate & 0xff,
            (byteRate >> 8) & 0xff,
            (byteRate >> 16) & 0xff,
            (byteRate >> 24) & 0xff
        ]),
        28
    );
    // Block align (channels * bytes per sample)
    header.set([numChannels * bytesPerSample, 0], 32); // N channels * 16-bit per channel / 8
    // Bits per sample
    header.set([16, 0], 34); // 16-bit

    // Data chunk identifier 'data'
    header.set([100, 97, 116, 97], 36);
    // Data chunk length
    header.set(
        new Uint8Array([
            dataSize & 0xff,
            (dataSize >> 8) & 0xff,
            (dataSize >> 16) & 0xff,
            (dataSize >> 24) & 0xff
        ]),
        40
    );

    const wavData = new Uint8Array(fileSize + 8);
    let offset = headerSize;
    wavData.set(header, 0);

    // Interleave audio data (combine channels)
    let multiplier = 32767;
    if (normalizeAudio) {
        // Find min and max values to prevent clipping when converting to 16 bits
        const numSamples = audioData[0].length;

        let maxAbsValue = 0;

        for (let ch = 0; ch < numChannels; ch++) {
            const data = audioData[ch];
            for (let i = 0; i < numSamples; i++) {
                const sample = Math.abs(data[i]);
                if (sample > maxAbsValue) {
                    maxAbsValue = sample;
                }
            }
        }

        multiplier = maxAbsValue > 0 ? 32767 / maxAbsValue : 1;
    }
    for (let i = 0; i < length; i++) {
        // Interleave both channels
        audioData.forEach((d) => {
            const sample = Math.min(32767, Math.max(-32768, d[i] * multiplier));
            // Convert to 16-bit
            wavData[offset++] = sample & 0xff;
            wavData[offset++] = (sample >> 8) & 0xff;
        });
    }

    if (infoOn) {
        wavData.set(infoChunk, offset);
        offset += infoChunk.length;
    }
    if (cueOn) {
        wavData.set(cueChunk, offset);
    }

    return wavData.buffer;
}
