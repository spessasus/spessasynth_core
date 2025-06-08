// process arguments
import fs from "fs";
import { loadSoundFont } from "../../src/soundfont/load_soundfont.js";

const args = process.argv.slice(2);
if (args.length !== 2)
{
    console.log("Usage: node index.js <dls input path> <sf2 output path>");
    process.exit();
}

const dlsPath = args[0];
const sf2Path = args[1];

const dls = fs.readFileSync(dlsPath);
const bank = loadSoundFont(dls);
console.log(`Loaded! Name: ${bank.soundFontInfo["INAM"]}`);
const outSF2 = bank.write();
fs.writeFileSync(sf2Path, outSF2);
console.log("Converted succesfully!");