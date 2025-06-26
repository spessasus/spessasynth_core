// process arguments
import fs from "fs";
import { loadSoundFont } from "../../src/soundfont/load_soundfont.js";
import { BasicSoundBank } from "../../src/soundfont/basic_soundfont/basic_soundbank.js";


const args = process.argv.slice(2);
if (args.length !== 1)
{
    console.info("Usage: node index.js <sf2/dls input path>");
    process.exit();
}

const filePath = args[0];
const file = fs.readFileSync(filePath);
await BasicSoundBank.isSF3DecoderReady;
const bank = loadSoundFont(file);
console.info("Loaded bank:", bank.soundFontInfo["INAM"]);

console.group("Bank information");
Object.entries(bank.soundFontInfo).forEach(([key, value]) =>
{
    console.info(`${key}: ${value.toString().trim()}`);
});

console.info(`\nPreset count: ${bank.presets.length}`);
console.info(`Instrument count: ${bank.instruments.length}`);
console.info(`Sample count: ${bank.samples.length}`);
console.groupEnd();

console.group("Preset data:");
bank.presets.forEach(preset =>
{
    console.group(`\n--- ${preset.presetName} ---`);
    console.info("Bank:", preset.bank);
    console.info("Program:", preset.program);
    
    console.group("Zones:");
    console.info("\n--- Global Zone ---");
    console.info("Key range:", preset.globalZone.keyRange);
    console.info("Velocity range:", preset.globalZone.velRange);
    
    preset.presetZones.forEach(zone =>
    {
        console.info(`\n--- ${zone.instrument.instrumentName} ---`);
        console.info("Key range:", zone.keyRange);
        console.info("Velocity range:", zone.velRange);
    });
    console.groupEnd();
    console.groupEnd();
});
console.groupEnd();

console.group("Instrument data:");
bank.instruments.forEach(inst =>
{
    console.group(`\n--- ${inst.instrumentName} ---`);
    console.info("Linked presets:", inst.linkedPresets.map(p => p.presetName).join(", "));
    
    console.group("Zones:");
    console.info("\n--- Global Zone ---");
    console.info("Key range:", inst.globalZone.keyRange);
    console.info("Velocity range:", inst.globalZone.velRange);
    
    inst.instrumentZones.forEach(zone =>
    {
        console.info(`\n--- ${zone.sample.sampleName} ---`);
        console.info("Key range:", zone.keyRange);
        console.info("Velocity range:", zone.velRange);
    });
    console.groupEnd();
    console.groupEnd();
});
console.groupEnd();

console.group("Sample data:");
bank.samples.forEach(sample =>
{
    console.group(`\n--- ${sample.sampleName} ---`);
    
    console.info("MIDI Key:", sample.samplePitch);
    console.info("Cent correction:", sample.samplePitchCorrection);
    console.info("Compressed:", sample.isCompressed);
    console.info("Sample link", sample.linkedSample ? sample.linkedSample.sampleName : "unlinked");
    console.info("Linked instruments:", sample.linkedInstruments.map(i => i.instrumentName).join(", "));
    console.groupEnd();
});
console.groupEnd();