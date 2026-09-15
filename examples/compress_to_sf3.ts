import { BasicSoundBank, SoundBankLoader } from "../src";
import * as child_process from "node:child_process";
import fs from "node:fs/promises";

/**
 * Compresses a mono sample to Ogg Vorbis using ffmpeg. Reads from and writes to stdio only.
 * @param audioData the sample data, always mono.
 * @param sampleRate the sample rate in hertz.
 * @returns the compressed Ogg Vorbis bitstream.
 */
function encodeVorbis(
    audioData: Float32Array,
    sampleRate: number
): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        const ffmpeg = child_process.spawn("ffmpeg", [
            "-hide_banner",
            "-loglevel",
            "error",

            // Input: raw float32 PCM from stdin
            "-f",
            "f32le",
            "-ar",
            sampleRate.toString(),
            "-ac",
            "1",
            "-i",
            "pipe:0",

            // Encode to Ogg Vorbis
            "-c:a",
            "libvorbis",

            // Output to stdout
            "-f",
            "ogg",
            "pipe:1"
        ]);

        const chunks: Buffer[] = [];
        ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
        ffmpeg.stderr.on("data", (chunk: Buffer) => {
            if (chunk.length > 0) console.error(`[ffmpeg] ${chunk.toString()}`);
        });
        ffmpeg.on("error", (error) => {
            reject(
                new Error(
                    `Failed to run ffmpeg. Make sure it is installed: ${error.message}`
                )
            );
        });
        ffmpeg.on("close", (code) => {
            if (code !== 0)
                return reject(new Error(`ffmpeg exited with code ${code}`));

            resolve(new Uint8Array(Buffer.concat(chunks)));
        });

        ffmpeg.stdin.write(
            Buffer.from(
                audioData.buffer,
                audioData.byteOffset,
                audioData.byteLength
            )
        );
        ffmpeg.stdin.end();
    });
}

console.info("This example needs ffmpeg to be installed on your computer.");

// Process arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
    console.info("Usage: tsx index.ts <sf2 input path> <sf3 output path>");
    process.exit();
}

const sf2Path = args[0];
const sf3Path = args[1];

await BasicSoundBank.ready;

// Load
const bin = await fs.readFile(sf2Path);
const bank = SoundBankLoader.fromArrayBuffer(bin.buffer);

// Compress
console.time("Compressed in");
await bank.setSampleFormat({
    format: "compressed",
    compressionFunction: encodeVorbis,
    progressFunction: (progress) =>
        console.info(`\rCompressing... ${(progress * 100).toFixed(2)}%`)
});
console.timeEnd("Compressed in");

// Write
console.info("Writing file...");
const outSF3 = bank.writeSF2();
await fs.writeFile(sf3Path, new Uint8Array(outSF3));
console.info(`File written to ${sf3Path}`);
