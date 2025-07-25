// process arguments
import fs from "fs";
import { loadSoundFont } from "../../src/soundbank/load_soundfont.js";
import { BasicSoundBank } from "../../src/soundbank/basic_soundbank/basic_soundbank.js";

const args = process.argv.slice(2);
if (args.length !== 2) {
    console.info("Usage: node index.js <sf2 input path> <dls output path>");
    process.exit();
}

const sf2Path = args[0];
const dlsPath = args[1];

await BasicSoundBank.isSF3DecoderReady;
console.warn("DLS conversion may lose data.");
const sf2 = fs.readFileSync(sf2Path);
console.time("Loaded in");
const bank = loadSoundFont(sf2);
console.timeEnd("Loaded in");
console.time("Converted in");
const outDLS = await bank.writeDLS();
console.timeEnd("Converted in");
console.info(`Writing file...`);
fs.writeFile(dlsPath, outDLS, () => {
    console.info(`File written to ${dlsPath}`);
});
