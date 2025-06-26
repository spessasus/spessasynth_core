// process arguments
import fs from "fs";
import { loadSoundFont } from "../../src/soundfont/load_soundfont.js";
import { BasicSoundBank } from "../../src/soundfont/basic_soundfont/basic_soundbank.js";

const args = process.argv.slice(2);
if (args.length !== 2)
{
    console.info("Usage: node index.js <dls input path> <sf2 output path>");
    process.exit();
}

const dlsPath = args[0];
const sf2Path = args[1];

await BasicSoundBank.isSF3DecoderReady;
const dls = fs.readFileSync(dlsPath);
console.time("Loaded in");
const bank = loadSoundFont(dls);
console.timeEnd("Loaded in");
console.time("Converted in");
console.info(`Name: ${bank.soundFontInfo["INAM"]}`);
const outSF2 = await bank.write();
console.timeEnd("Converted in");
console.info(`Writing file...`);
fs.writeFile(sf2Path, outSF2, () =>
{
    console.info(`File written to ${sf2Path}`);
});