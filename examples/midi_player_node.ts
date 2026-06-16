import {
    BasicMIDI,
    SoundBankLoader,
    SpessaLog,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "../src";
import * as fs from "node:fs/promises";
import { Readable } from "node:stream";
import * as child_process from "node:child_process";

console.info("This example needs ffmpeg to be installed on your computer.");
// Process arguments
const args = process.argv.slice(2);
if (args.length < 2) {
    console.info("Usage: tsx index.ts <soundbank path> <midi path>");
    process.exit();
}
const sfPath = args[0];
const midPath = args[1];

const sf = await fs.readFile(sfPath);
const mid = await fs.readFile(midPath);

const sampleRate = 44_100;
SpessaLog.setLogLevel(true, true, true);

// Initialize the synthesizer
console.info("Initializing synthesizer...");
const synth = new SpessaSynthProcessor(sampleRate, {
    eventsEnabled: false
});

// Load sound bank
synth.soundBankManager.addSoundBank(
    SoundBankLoader.fromArrayBuffer(sf.buffer),
    "main"
);
await synth.processorInitialized;

// Initialize the sequencer
const seq = new SpessaSynthSequencer(synth);

// Load MIDI
console.info("Parsing MIDI file...");
const midi = BasicMIDI.fromArrayBuffer(mid.buffer);
console.info(`Now playing: ${midi.getName()}`);
seq.loadNewSongList([midi]);
seq.play();
seq.loopCount = Infinity;

const bufSize = 128;

const audioStream = new Readable({
    read() {
        const left = new Float32Array(bufSize);
        const right = new Float32Array(bufSize);
        seq.processTick();
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
