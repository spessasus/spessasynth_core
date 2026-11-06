import type { WaveReadResult } from "./types";
import { readLittleEndian } from "./byte_functions/little_endian";

/**
 * Reads a WAVE file into PCM audio data, the counterpart of {@link audioToWav}.
 *
 * It reads 8, 16, 24 and 32-bit integer PCM and 32 and 64-bit float files (including `WAVE_FORMAT_EXTENSIBLE`).
 * The loop is read from the first loop of the `smpl` chunk. Without one, a `cue ` chunk with exactly two points
 * is taken as the loop start and end, which is how {@link audioToWav} writes it.
 *
 * > **Note**
 * >
 * > The returned loop end is exclusive, like the SoundFont loop end.
 *
 * @param buffer The binary WAVE file.
 * @returns The audio data (one array per channel), the sample rate and the loop, if the file has one.
 * @throws Error if the file is not a valid or supported WAVE file.
 *
 * @group Utilities
 */
export function wavToAudio(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    const fourCC = (at: number) =>
        String.fromCodePoint(
            bytes[at],
            bytes[at + 1],
            bytes[at + 2],
            bytes[at + 3]
        );
    // Chunk IDs are letters and digits with optional trailing spaces, a pad byte is usually zero
    const isFourCC = (at: number) =>
        at + 4 <= bytes.length && /^[\dA-Za-z]+ *$/.test(fourCC(at));
    const nextChunk = (body: number, size: number) => {
        const end = body + size;
        return size % 2 === 1 && !(isFourCC(end) && !isFourCC(end + 1))
            ? end + 1
            : end;
    };
    if (
        buffer.byteLength < 12 ||
        fourCC(0) !== "RIFF" ||
        fourCC(8) !== "WAVE"
    ) {
        throw new Error("Not a WAVE file.");
    }

    let format = 0;
    let channels = 0;
    let sampleRate = 0;
    let bitsPerSample = 0;
    let dataStart = -1;
    let dataSize = 0;
    let smplLoop: { start: number; end: number } | undefined;
    const cuePoints = new Array<{ id: number; offset: number }>();
    const namedCues = new Set<number>();

    let pos = 12;
    while (pos + 8 <= buffer.byteLength) {
        const id = fourCC(pos);
        const size = readLittleEndian(bytes, 4, pos + 4);
        const body = pos + 8;
        // A truncated data chunk is common, take what is there
        const available = Math.min(size, buffer.byteLength - body);
        switch (id) {
            case "fmt ": {
                if (available < 16)
                    throw new Error("The WAVE file's fmt chunk is too short.");

                format = readLittleEndian(bytes, 2, body);
                channels = readLittleEndian(bytes, 2, body + 2);
                sampleRate = readLittleEndian(bytes, 4, body + 4);
                bitsPerSample = readLittleEndian(bytes, 2, body + 14);
                // Extensible
                if (format === 0xff_fe && available >= 26) {
                    format = readLittleEndian(bytes, 2, body + 24);
                }
                break;
            }
            case "data": {
                dataStart = body;
                dataSize = available;
                break;
            }
            case "smpl": {
                // 36 bytes of header, then the loops of 24 bytes each
                const loops =
                    available >= 36 ? readLittleEndian(bytes, 4, body + 28) : 0;
                if (loops > 0 && available >= 36 + 24) {
                    smplLoop = {
                        start: readLittleEndian(bytes, 4, body + 36 + 8),
                        // The smpl end point is played too, so +1 for an exclusive end
                        end: readLittleEndian(bytes, 4, body + 36 + 12) + 1
                    };
                }
                break;
            }
            case "cue ": {
                const count =
                    available >= 4 ? readLittleEndian(bytes, 4, body) : 0;
                for (
                    let i = 0;
                    i < count && 4 + (i + 1) * 24 <= available;
                    i++
                ) {
                    const point = body + 4 + i * 24;
                    // The ID comes first and the sample offset last
                    cuePoints.push({
                        id: readLittleEndian(bytes, 4, point),
                        offset: readLittleEndian(bytes, 4, point + 20)
                    });
                }
                break;
            }
            case "LIST": {
                if (available < 4 || fourCC(body) !== "adtl") break;
                const end = body + available;
                let at = body + 4;
                while (at + 12 <= end) {
                    const subId = fourCC(at);
                    const subSize = readLittleEndian(bytes, 4, at + 4);
                    if (
                        subSize >= 4 &&
                        (subId === "labl" ||
                            subId === "note" ||
                            subId === "ltxt")
                    ) {
                        namedCues.add(readLittleEndian(bytes, 4, at + 8));
                    }
                    at = nextChunk(at + 8, subSize);
                }
                break;
            }
        }
        pos = nextChunk(body, size);
    }

    if (channels === 0 || dataStart === -1) {
        throw new Error("The WAVE file has no fmt or data chunk!");
    }
    const bytesPerSample = bitsPerSample >> 3;
    const isFloat = format === 3;
    if (
        (format !== 1 && format !== 3) ||
        (isFloat
            ? ![4, 8].includes(bytesPerSample)
            : bytesPerSample < 1 || bytesPerSample > 4)
    ) {
        throw new Error(
            `Unsupported WAVE format ${format} with ${bitsPerSample} bits per sample.`
        );
    }

    const frames = Math.floor(dataSize / (bytesPerSample * channels));
    const count = frames * channels;
    const pcm = bytes.slice(dataStart, dataStart + count * bytesPerSample);
    let samples: ArrayLike<number>;
    let offset = 0;
    let scale = 1;
    if (isFloat) {
        samples =
            bytesPerSample === 4
                ? new Float32Array(pcm.buffer)
                : new Float64Array(pcm.buffer);
    } else {
        switch (bytesPerSample) {
            case 1: {
                // 8-bit is unsigned
                samples = pcm;
                offset = 128;
                scale = 128;
                break;
            }
            case 2: {
                samples = new Int16Array(pcm.buffer);
                scale = 32_768;
                break;
            }
            case 3: {
                const s24 = new Int32Array(count);
                for (let i = 0; i < count; i++) {
                    const at = i * 3;
                    s24[i] =
                        ((pcm[at + 2] << 24) |
                            (pcm[at + 1] << 16) |
                            (pcm[at] << 8)) >>
                        8;
                }
                samples = s24;
                scale = 8_388_608;
                break;
            }
            default: {
                samples = new Int32Array(pcm.buffer);
                scale = 2_147_483_648;
            }
        }
    }
    const audioData = Array.from(
        { length: channels },
        () => new Float32Array(frames)
    );
    for (let i = 0; i < frames; i++) {
        for (let c = 0; c < channels; c++) {
            audioData[c][i] = (samples[i * channels + c] - offset) / scale;
        }
    }

    let loop = smplLoop;
    const [cueStart, cueEnd] = cuePoints;
    if (
        !loop &&
        cuePoints.length === 2 &&
        !namedCues.has(cueStart.id) &&
        !namedCues.has(cueEnd.id)
    ) {
        loop = { start: cueStart.offset, end: cueEnd.offset };
    }
    if (loop) {
        loop =
            loop.end <= loop.start || loop.start >= frames
                ? undefined
                : { start: loop.start, end: Math.min(loop.end, frames) };
    }
    const result: WaveReadResult = { audioData, sampleRate, loop };
    return result;
}
