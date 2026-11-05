import type { WaveReadResult } from "./types";

/**
 * Reads a WAVE file into PCM audio data, the counterpart of {@link audioToWav}.
 *
 * It reads 8, 16, 24 and 32-bit integer PCM and 32 and 64-bit float files (including `WAVE_FORMAT_EXTENSIBLE`).
 * The loop is read from the first loop of the `smpl` chunk. Without one, the first two points of the `cue ` chunk
 * are taken as the loop start and end, which is how {@link audioToWav} writes it.
 * Other files may use cue points as plain markers, so such a loop is only reliable for files written by core.
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
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const fourCC = (at: number) =>
        String.fromCodePoint(
            bytes[at],
            bytes[at + 1],
            bytes[at + 2],
            bytes[at + 3]
        );
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
    const cuePoints = new Array<number>();

    let pos = 12;
    while (pos + 8 <= buffer.byteLength) {
        const id = fourCC(pos);
        const size = view.getUint32(pos + 4, true);
        const body = pos + 8;
        // A truncated data chunk is common, take what is there
        const available = Math.min(size, buffer.byteLength - body);
        switch (id) {
            case "fmt ": {
                format = view.getUint16(body, true);
                channels = view.getUint16(body + 2, true);
                sampleRate = view.getUint32(body + 4, true);
                bitsPerSample = view.getUint16(body + 14, true);
                // Extensible
                if (format === 0xff_fe && size >= 26) {
                    format = view.getUint16(body + 24, true);
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
                const loops = size >= 36 ? view.getUint32(body + 28, true) : 0;
                if (loops > 0 && size >= 36 + 24) {
                    smplLoop = {
                        start: view.getUint32(body + 36 + 8, true),
                        // The smpl end point is played too, so +1 for an exclusive end
                        end: view.getUint32(body + 36 + 12, true) + 1
                    };
                }
                break;
            }
            case "cue ": {
                const count = view.getUint32(body, true);
                for (let i = 0; i < count && 4 + (i + 1) * 24 <= size; i++) {
                    // The sample offset is the last field of each point
                    cuePoints.push(
                        view.getUint32(body + 4 + i * 24 + 20, true)
                    );
                }
                break;
            }
        }
        pos = body + size + (size % 2);
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
    const audioData = Array.from(
        { length: channels },
        () => new Float32Array(frames)
    );
    for (let i = 0; i < frames; i++) {
        for (let c = 0; c < channels; c++) {
            const at = dataStart + (i * channels + c) * bytesPerSample;
            let value: number;
            if (isFloat) {
                value =
                    bytesPerSample === 4
                        ? view.getFloat32(at, true)
                        : view.getFloat64(at, true);
            } else {
                switch (bytesPerSample) {
                    case 1: {
                        // 8-bit is unsigned
                        value = (view.getUint8(at) - 128) / 128;
                        break;
                    }
                    case 2: {
                        value = view.getInt16(at, true) / 32_768;
                        break;
                    }
                    case 3: {
                        value =
                            (((bytes[at + 2] << 24) |
                                (bytes[at + 1] << 16) |
                                (bytes[at] << 8)) >>
                                8) /
                            8_388_608;
                        break;
                    }
                    default: {
                        value = view.getInt32(at, true) / 2_147_483_648;
                    }
                }
            }
            audioData[c][i] = value;
        }
    }

    let loop = smplLoop;
    // AudioToWav writes the cue points as frame offsets, with the end exclusive
    if (!loop && cuePoints.length >= 2) {
        loop = { start: cuePoints[0], end: cuePoints[1] };
    }
    const result: WaveReadResult = { audioData, sampleRate, loop };
    return result;
}
