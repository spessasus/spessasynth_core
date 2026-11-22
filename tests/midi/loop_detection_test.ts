import { BasicMIDI } from "../../src";
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

console.info(
    mid.loop.start === mid.firstNoteOn
        ? `Loop start is using the first note on: ${mid.firstNoteOn}`
        : `Loop start detected: ${mid.loop.start}`
);
console.info(
    mid.loop.end === mid.lastVoiceEventTick
        ? `Loop end is using the last voice event: ${mid.lastVoiceEventTick}`
        : `Loop end detected: ${mid.loop.end}.`
);
