// Process arguments
import * as fs from "node:fs/promises";
import { BasicMIDI } from "../src";

const args = process.argv.slice(2);
if (args.length !== 1) {
    console.info("Usage: tsx index.ts<midi path>");
    process.exit();
}
const midPath = args[0];

const m = await fs.readFile(midPath);
const mid = BasicMIDI.fromArrayBuffer(m.buffer as ArrayBuffer);

const loopEnd = mid.loop.end;
const loopEndSeconds = mid.midiTicksToSeconds(loopEnd);
const loopEndTicks2 = mid.secondsToMIDITicks(loopEndSeconds);
console.info("Loop end in ticks:", loopEnd);
console.info("Loop end in seconds:", loopEndSeconds);
if (loopEndTicks2 !== loopEnd) {
    throw new Error(
        `Test failed!, ticks -> seconds -> ticks resulted in ${loopEndTicks2} instead of ${loopEnd}`
    );
} else {
    console.info("Test passed! Ticks match.", loopEndTicks2, loopEnd);
}
