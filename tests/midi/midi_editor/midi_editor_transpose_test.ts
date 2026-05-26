import fs from "node:fs/promises";
import { BasicMIDI, SpessaLog } from "../../../src";

const args = process.argv.slice(2);
if (args.length !== 2) {
    console.info("Usage: tsx index.ts <mid input path> <mid output path>");
    process.exit();
}

const mid = await fs.readFile(args[0]);
const midi = BasicMIDI.fromArrayBuffer(mid.buffer);

SpessaLog.setLogLevel(true, true, true);

const p = new Map<number, { fineTune: number }>();
for (let i = 0; i < 16; i++) {
    p.set(i, {
        fineTune: i === 9 ? 0 : 65
    });
}

midi.modify({
    channels: p
});

await fs.writeFile(args[1], new Uint8Array(midi.writeMIDI()));
