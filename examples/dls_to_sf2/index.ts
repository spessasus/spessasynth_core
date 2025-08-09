// Process arguments
import * as fs from "node:fs";
import { BasicSoundBank, SoundBankLoader } from "../../src";

const args = process.argv.slice(2);
if (args.length !== 2) {
    console.info("Usage: tsx index.ts <dls input path> <sf2 output path>");
    process.exit();
}

const dlsPath = args[0];
const sf2Path = args[1];

await BasicSoundBank.isSF3DecoderReady;
const dls = fs.readFileSync(dlsPath);
console.time("Loaded in");
const bank = SoundBankLoader.fromArrayBuffer(dls.buffer);
console.timeEnd("Loaded in");
console.time("Converted in");
console.info(`Name: ${bank.soundBankInfo.INAM}`);
const outSF2 = await bank.writeSF2();
console.timeEnd("Converted in");
console.info(`Writing file...`);
fs.writeFile(sf2Path, new Uint8Array(outSF2), () => {
    console.info(`File written to ${sf2Path}`);
});
