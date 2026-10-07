import { MIDITestMaker } from "../midi_file/midi_test_maker";
import path from "node:path";
import fs from "node:fs/promises";
import { SoundBankLoader, SpessaLog } from "../../src";

// Process arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
    console.info("Usage: tsx index.ts <sf path>");
    process.exit();
}
const sfPath = args[0];

const sf = await fs.readFile(sfPath);
const sbk = SoundBankLoader.fromArrayBuffer(sf.buffer);

const test = new MIDITestMaker("Multi-message SysEx editing test");

test.text(
    "This test checks if the MIDI Editor correctly replaces the TONE NUMBER sysex."
);

test.text("Changing to Saw Wave via regular program change").programChange(
    0,
    0,
    81
);

test.note(60, 127, 960).wait(960);

test.text("Changing to Square Wave via TONE NUMBER sysex.").gs(
    0x40,
    0x11,
    0x00,
    [1, 80]
);

test.note(60, 127, 960).wait(960);

test.flush();
SpessaLog.setLogLevel(true, true, true);
const bin = test.writeRMIDI(sf.buffer, {
    soundBank: sbk
});

const out = path.join(import.meta.dirname, "../..", "rmidi_tone_number.mid");
await fs.writeFile(out, new Uint8Array(bin));
console.info(`File written to ${out}`);
