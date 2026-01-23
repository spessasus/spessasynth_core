import { BasicMIDI, SpessaSynthProcessor, SpessaSynthSequencer } from "../src";
import * as fs from "fs/promises";

// Process arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
    console.info("Usage: tsx index.ts<midi path>");
    process.exit();
}
const midPath = args[0];

const m = await fs.readFile(midPath);
const mid = BasicMIDI.fromArrayBuffer(m.buffer as ArrayBuffer);
const rate = 44100;
const proc = new SpessaSynthProcessor(rate);

proc.createMIDIChannel();
const seq = new SpessaSynthSequencer(proc);
seq.loadNewSongList([mid]);

const sampleDuration = rate * mid.duration;
const quantum = 128;

const audio = [
    [new Float32Array(sampleDuration), new Float32Array(sampleDuration)]
];
let index = 0;
while (index < sampleDuration) {
    const toRender = Math.min(quantum, sampleDuration - index);
    seq.processTick();
    proc.renderAudioSplit([], [], audio, index, toRender);
    index += toRender;
}
console.info(`Succesfully rendered ${mid.getName()} with no sound banks.`);
