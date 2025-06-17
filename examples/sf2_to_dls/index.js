// process arguments
import fs from "fs";
import { loadSoundFont } from "../../src/soundfont/load_soundfont.js";
import { SpessaSynthLogging } from "../../src/utils/loggin.js";
import { BasicSoundBank } from "../../src/soundfont/basic_soundfont/basic_soundbank.js";

const args = process.argv.slice(2);
if (args.length !== 2)
{
    console.log("Usage: node index.js <sf2 input path> <dls output path>");
    process.exit();
}

const sf2Path = args[0];
const dlsPath = args[1];

await BasicSoundBank.isSF3DecoderReady;
console.warn("DLS conversion may lose data.");
SpessaSynthLogging(true, true, true, true);
const sf2 = fs.readFileSync(sf2Path);
const bank = loadSoundFont(sf2);
console.log(`Loaded! Name: ${bank.soundFontInfo["INAM"]}`);
const outDLS = bank.writeDLS();
fs.writeFileSync(dlsPath, outDLS);
console.log("Converted succesfully!");