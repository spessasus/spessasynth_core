import { SoundBankLoader, SpessaSynthProcessor } from "../../src";
import * as fs from "node:fs/promises";
import { Readable } from "node:stream";
import * as child_process from "node:child_process";

// Process arguments
const args = process.argv.slice(2);
if (args.length === 0) {
    console.info("Usage: tsx index.ts <soundbank path>");
    process.exit();
}
const sf = await fs.readFile(args[0]);
const sampleRate = 44_100;
const synth = new SpessaSynthProcessor(sampleRate, {
    eventsEnabled: false
});
synth.soundBankManager.addSoundBank(
    SoundBankLoader.fromArrayBuffer(sf.buffer),
    "main"
);
await synth.ready;

const bufSize = 128;

const audioStream = new Readable({
    read() {
        const left = new Float32Array(bufSize);
        const right = new Float32Array(bufSize);
        synth.process(left, right);

        const interleaved = new Float32Array(left.length * 2);
        for (let i = 0; i < left.length; i++) {
            interleaved[i * 2] = left[i];
            interleaved[i * 2 + 1] = right[i];
        }

        this.push(
            Buffer.from(
                interleaved.buffer,
                interleaved.byteOffset,
                interleaved.byteLength
            )
        );
    }
});

// Spawn ffplay to play directly to the speakers
const speakers = child_process.spawn(
    "ffplay",
    [
        "-f",
        "f32le",
        "-sample_rate",
        sampleRate.toString(),
        "-ch_layout",
        "stereo",
        "-nodisp",
        "-"
    ],
    {
        stdio: ["pipe"]
    }
);

audioStream.pipe(speakers.stdin);
synth.noteOn(9, 49, 127);
