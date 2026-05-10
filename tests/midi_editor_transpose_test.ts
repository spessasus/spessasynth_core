import fs from "node:fs/promises";
import { BasicMIDI, SpessaLog } from "../src";

const args = process.argv.slice(2);
if (args.length !== 2) {
    console.info("Usage: tsx index.ts <mid input path> <mid output path>");
    process.exit();
}

const mid = await fs.readFile(args[0]);
const midi = BasicMIDI.fromArrayBuffer(mid.buffer);

SpessaLog.setLogLevel(true, true, true);

const p = [];
for (let i = 0; i < 16; i++) {
    p.push({
        channel: i,
        pitchOffset: 0.5
    });
}

midi.modify({
    pitchOffsets: p
});

await fs.writeFile(args[1], new Uint8Array(midi.writeMIDI()));
