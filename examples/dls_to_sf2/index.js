// process arguments
import fs from "fs";
import { loadSoundFont } from "../../src/soundfont/load_soundfont.js";
import { BasicSoundBank } from "../../src/soundfont/basic_soundfont/basic_soundbank.js";

const args = process.argv.slice(2);
if (args.length !== 2)
{
    console.log("Usage: node index.js <dls input path> <sf2 output path>");
    process.exit();
}

const dlsPath = args[0];
const sf2Path = args[1];

await BasicSoundBank.isSF3DecoderReady;
const dls = fs.readFileSync(dlsPath);
const bank = loadSoundFont(dls);
console.log(`Loaded! Name: ${bank.soundFontInfo["INAM"]}`);
const outSF2 = bank.write();
console.log("Converted succesfully!");
fs.writeFileSync(sf2Path, outSF2);
console.log(`File written to ${sf2Path}`);