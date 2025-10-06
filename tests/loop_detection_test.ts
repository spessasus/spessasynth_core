import { BasicMIDI } from "../src";
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

if (mid.loop.start === mid.firstNoteOn) {
    console.info(`Loop start is using the first note on: ${mid.firstNoteOn}`);
} else {
    console.info(`Loop start detected: ${mid.loop.start}`);
}
if (mid.loop.end === mid.lastVoiceEventTick) {
    console.info(
        `Loop end is using the last voice event: ${mid.lastVoiceEventTick}`
    );
} else {
    console.info(`Loop end detected: ${mid.loop.end}.`);
}
