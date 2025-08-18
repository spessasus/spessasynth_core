// Process arguments
import * as fs from "fs";
import { BasicMIDI, BasicSoundBank, SoundBankLoader } from "../../src";

const args = process.argv.slice(2);
if (args.length !== 3) {
    console.info(
        "Usage: tsx index.ts <sf2/dls input path> <mid input path> <rmi output path>"
    );
    process.exit();
}

const sfPath = args[0];
const midPath = args[1];
const outPath = args[2];

// Await sf3 decoder
await BasicSoundBank.isSF3DecoderReady;

// Load bank and MIDI
const bank = SoundBankLoader.fromArrayBuffer(fs.readFileSync(sfPath).buffer);
const midi = BasicMIDI.fromArrayBuffer(fs.readFileSync(midPath).buffer);
console.info("Loaded bank and MIDI!");

// Trim sf2 for midi
bank.trimSoundBank(midi);

// Write rmid
const rmidi = midi.writeRMIDI(await bank.writeSF2(), {
    soundBank: bank
});
fs.writeFile(outPath, new Uint8Array(rmidi), () => {
    console.info(`File written to ${outPath}`);
});
