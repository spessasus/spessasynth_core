// process arguments
import * as fs from "fs";
import { BasicMIDI, BasicSoundBank } from "../../src";

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

// await sf3 decoder
await BasicSoundBank.isSF3DecoderReady;

// load bank and MIDI
const bank = BasicSoundBank.fromArrayBuffer(fs.readFileSync(sfPath).buffer);
const midi = BasicMIDI.fromArrayBuffer(fs.readFileSync(midPath).buffer);
console.info("Loaded bank and MIDI!");

// trim sf2 for midi
bank.trimSoundBank(midi);

// write rmidi
const rmidi = midi.writeRMIDI(await bank.write(), bank);
fs.writeFileSync(outPath, rmidi);
fs.writeFile(outPath, rmidi, () => {
    console.info(`File written to ${outPath}`);
});
