// Process arguments
import * as fs from "node:fs/promises";
import { BasicMIDI, BasicSoundBank, SoundBankLoader, SpessaLog } from "../src";

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

SpessaLog.setLogLevel(true, true, true);

// Load bank and MIDI
const bankFile = await fs.readFile(sfPath);
const bank = SoundBankLoader.fromArrayBuffer(bankFile.buffer);
const midiFile = await fs.readFile(midPath);
const midi = BasicMIDI.fromArrayBuffer(midiFile.buffer);
console.info("Loaded bank and MIDI!");

// Trim sf2 for midi
bank.trim(midi.getUsedProgramsAndKeys(bank));

// Write rmid
const rmidi = midi.writeRMIDI(bank.writeSF2(), {
    soundBank: bank
});
await fs.writeFile(outPath, new Uint8Array(rmidi));
console.info(`File written to ${outPath}`);
