import * as fs from "node:fs";
import { audioToWav } from "../../src";
import { SoundBankLoader } from "../../src/soundbank/sound_bank_loader";

// process arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
    console.info("Usage: tsx index.ts <soundbank path> <wav output path>");
    process.exit();
}

const output = args[1];
const file = fs.readFileSync(args[0]);
const bank = SoundBankLoader.fromArrayBuffer(file.buffer);
const sample = bank.samples[0];
console.info("Exporting sample:", sample.sampleName, "...");
const wav = audioToWav([sample.getAudioData()], sample.sampleRate);
fs.writeFileSync(output, new Uint8Array(wav));
console.info("Done!");
