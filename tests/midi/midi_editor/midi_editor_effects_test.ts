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

/**
 * Some files have a GS reset and note on, on the same tick (tick 0)
 * Test that effects don't get inserted before GS!
 */
midi.modify({
    reverbParams: {
        time: 80,
        character: 4,
        level: 67,
        delayFeedback: 0,
        preDelayTime: 1,
        preLowpass: 1
    }
});

await fs.writeFile(args[1], new Uint8Array(midi.writeMIDI()));
