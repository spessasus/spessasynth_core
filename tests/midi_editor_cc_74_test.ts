import fs from "node:fs/promises";
import {
    BasicMIDI,
    type MIDIController,
    MIDIControllers,
    SpessaLog
} from "../src";

const args = process.argv.slice(2);
if (args.length !== 2) {
    console.info("Usage: tsx index.ts <mid input path> <mid output path>");
    process.exit();
}

const mid = await fs.readFile(args[0]);
const midi = BasicMIDI.fromArrayBuffer(mid.buffer);

SpessaLog.setLogLevel(true, true, true);

// Modify CC 74 as it can be set via:
// - CC
// - SysEx
// - NRPN
// Excellent NRPN test: MIDI_Jam & Spoon_Right In The Night.mid

const p = new Map<number, { controllers: Map<MIDIController, number> }>();
for (let i = 0; i < 16; i++) {
    const ccs = new Map<MIDIController, number>([
        [MIDIControllers.brightness, 65 + i]
    ]);
    p.set(i, {
        controllers: ccs
    });
}

midi.modify({
    channels: p
});

await fs.writeFile(args[1], new Uint8Array(midi.writeMIDI()));
