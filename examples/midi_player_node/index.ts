import {
    BasicMIDI,
    SoundBankLoader,
    SpessaSynthLogging,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "../../src";
import * as fs from "fs/promises";
import { Readable } from "node:stream";
import Speaker from "speaker";

// process arguments
const args = process.argv.slice(2) as string[];
if (args.length !== 2) {
    console.info("Usage: tsx index.ts <soundbank path> <midi path>");
    process.exit();
}
const sfPath = args[0];
const midPath = args[1];

const sf = await fs.readFile(sfPath);
const mid = await fs.readFile(midPath);

const sampleRate = 44100;
SpessaSynthLogging(true, true, true);
const synth = new SpessaSynthProcessor(sampleRate, {
    effectsEnabled: false
});
synth.soundBankManager.addSoundBank(
    SoundBankLoader.fromArrayBuffer(sf.buffer as ArrayBuffer),
    "main"
);
await synth.processorInitialized;

const seq = new SpessaSynthSequencer(synth);
seq.loadNewSongList([BasicMIDI.fromArrayBuffer(mid.buffer as ArrayBuffer)]);
seq.play();
seq.loopCount = Infinity;

const bufSize = 128;

const audioStream = new Readable({
    read() {
        const left = new Float32Array(bufSize);
        const right = new Float32Array(bufSize);
        const arr = [left, right];
        seq.processTick();
        synth.renderAudio(arr, [], []);

        const interleaved = new Float32Array(left.length * 2);
        for (let i = 0; i < left.length; i++) {
            interleaved[i * 2] = left[i];
            interleaved[i * 2 + 1] = right[i];
        }

        const buffer = Buffer.alloc(interleaved.length * 4); // 4 bytes per float
        for (let i = 0; i < interleaved.length; i++) {
            buffer.writeFloatLE(interleaved[i], i * 4);
        }
        this.push(buffer);
    }
});

const speaker = new Speaker({
    sampleRate: 44100,
    channels: 2,
    bitDepth: 32,
    // @ts-expect-error badly typed package (again)
    float: true
});
audioStream.pipe(speaker);
