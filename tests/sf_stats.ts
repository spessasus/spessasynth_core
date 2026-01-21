import * as fs from "fs/promises";
import { SoundBankLoader } from "../src";

// Process arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
    console.info("Usage: tsx index.ts <sf path>");
    process.exit();
}
const sfPath = args[0];

const sfBin = await fs.readFile(sfPath);
const bank = SoundBankLoader.fromArrayBuffer(sfBin.buffer);

let instrumentGens = 0;
let instrumentMods = 0;
for (const instrument of bank.instruments) {
    instrumentGens += instrument.globalZone.generators.length;
    instrumentMods += instrument.globalZone.modulators.length;
    instrument.zones.forEach((z) => {
        instrumentGens += z.generators.length;
        instrumentMods += z.modulators.length;
    });
}
let presetGens = 0;
let presetMods = 0;
for (const preset of bank.presets) {
    presetGens += preset.globalZone.generators.length;
    presetMods += preset.globalZone.modulators.length;
    preset.zones.forEach((z) => {
        presetMods += z.modulators.length;
        presetGens += z.generators.length;
    });
}

console.info("Instrument Generator count: ", instrumentGens);
console.info("Instrument Modulator count: ", instrumentMods);
console.info("Preset Generator count: ", presetGens);
console.info("Preset Modulator count: ", presetMods);
