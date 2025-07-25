import fs from "node:fs";
import { loadSoundFont } from "../../src/soundbank/load_soundfont.js";
import { audioToWav } from "../../src/utils/buffer_to_wav.js";

// process arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
    console.info("Usage: node index.js <soundbank path> <wav output path>");
    process.exit();
}

const output = args[1];
const file = fs.readFileSync(args[0]);
const bank = loadSoundFont(file);
const sample = bank.samples[0];
console.info("Exporting sample:", sample.sampleName, "...");
const wav = audioToWav([sample.getAudioData()], sample.sampleRate);
fs.writeFileSync(output, new Uint8Array(wav));
console.info("Done!");
