// process arguments
import fs from "fs";
import { loadSoundFont } from "../../src/soundfont/load_soundfont.js";
import { BasicSoundBank } from "../../src/soundfont/basic_soundfont/basic_soundbank.js";
import { MIDI } from "../../src/midi/midi_loader.js";

const args = process.argv.slice(2);
if (args.length !== 3)
{
    console.info("Usage: node index.js <sf2/dls input path> <mid input path> <rmi output path>");
    process.exit();
}

const sfPath = args[0];
const midPath = args[1];
const outPath = args[2];

// await sf3 decoder
await BasicSoundBank.isSF3DecoderReady;

// load bank and MIDI
const bank = loadSoundFont(fs.readFileSync(sfPath));
const midi = new MIDI(fs.readFileSync(midPath));
console.info("Loaded bank and MIDI!");

// trim sf2 for midi
bank.trimSoundBank(midi);

// write rmidi
const rmidi = midi.writeRMIDI(await bank.write(), bank);
fs.writeFileSync(outPath, rmidi);
fs.writeFile(outPath, rmidi, () =>
{
    console.info(`File written to ${outPath}`);
});