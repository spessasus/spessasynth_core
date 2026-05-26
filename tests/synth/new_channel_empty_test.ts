import {
    BasicMIDI,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "../../src";
import * as fs from "node:fs/promises";

// Process arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
    console.info("Usage: tsx index.ts<midi path>");
    process.exit();
}
const midPath = args[0];

const m = await fs.readFile(midPath);
const mid = BasicMIDI.fromArrayBuffer(m.buffer);
const rate = 44_100;
const proc = new SpessaSynthProcessor(rate);

proc.createMIDIChannel();
const seq = new SpessaSynthSequencer(proc);
seq.loadNewSongList([mid]);
seq.play();

const sampleDuration = rate * mid.duration;
const quantum = 128;

const left = new Float32Array(sampleDuration);
const right = new Float32Array(sampleDuration);
let index = 0;
while (index < sampleDuration) {
    const toRender = Math.min(quantum, sampleDuration - index);
    seq.processTick();
    proc.process(left, right, index, toRender);
    index += toRender;
}
console.info(`Successfully rendered ${mid.getName()} with no sound banks.`);
