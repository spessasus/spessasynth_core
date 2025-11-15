import * as fs from "fs/promises";
import { audioToWav, SoundBankLoader } from "../src";

// process arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
    console.info("Usage: tsx index.ts <soundbank path> <wav output path>");
    process.exit();
}

const output = args[1];
const file = await fs.readFile(args[0]);
const bank = SoundBankLoader.fromArrayBuffer(file.buffer);
const sample = bank.samples[0];
console.info("Exporting sample:", sample.name, "...");
const wav = audioToWav([sample.getAudioData()], sample.sampleRate);
await fs.writeFile(output, new Uint8Array(wav));
console.info(`File written to ${output}`);
