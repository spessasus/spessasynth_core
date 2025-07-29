// process arguments
import * as fs from "fs";
import { BasicSoundBank, SoundBankLoader } from "../../src";

const args = process.argv.slice(2);
if (args.length !== 1) {
    console.info("Usage: tsx index.ts <sf2/dls input path>");
    process.exit();
}

const filePath = args[0];
const file = fs.readFileSync(filePath);
await BasicSoundBank.isSF3DecoderReady;
const bank = SoundBankLoader.fromArrayBuffer(file.buffer);
console.info("Loaded bank:", bank.soundBankInfo["INAM"]);

console.group("Bank information");
Object.entries(bank.soundBankInfo).forEach(([key, value]) => {
    console.info(`${key}: ${value.toString().trim()}`);
});

console.info(`\nPreset count: ${bank.presets.length}`);
console.info(`Instrument count: ${bank.instruments.length}`);
console.info(`Sample count: ${bank.samples.length}`);
console.groupEnd();

console.group("Preset data:");
bank.presets.forEach((preset) => {
    console.group(`\n--- ${preset.name} ---`);
    console.info("Bank:", preset.bank);
    console.info("Program:", preset.program);

    console.group("Zones:");
    console.info("\n--- Global Zone ---");
    console.info("Key range:", preset.globalZone.keyRange);
    console.info("Velocity range:", preset.globalZone.velRange);

    preset.zones.forEach((zone) => {
        console.info(`\n--- ${zone?.instrument?.name} ---`);
        console.info("Key range:", zone.keyRange);
        console.info("Velocity range:", zone.velRange);
    });
    console.groupEnd();
    console.groupEnd();
});
console.groupEnd();

console.group("Instrument data:");
bank.instruments.forEach((inst) => {
    console.group(`\n--- ${inst.name} ---`);
    console.info(
        "Linked presets:",
        inst.linkedTo.map((p) => p.name).join(", ")
    );

    console.group("Zones:");
    console.info("\n--- Global Zone ---");
    console.info("Key range:", inst.globalZone.keyRange);
    console.info("Velocity range:", inst.globalZone.velRange);

    inst.zones.forEach((zone) => {
        console.info(`\n--- ${zone.sample.name} ---`);
        console.info("Key range:", zone.keyRange);
        console.info("Velocity range:", zone.velRange);
    });
    console.groupEnd();
    console.groupEnd();
});
console.groupEnd();

console.group("Sample data:");
bank.samples.forEach((sample) => {
    console.group(`\n--- ${sample.name} ---`);

    console.info("MIDI Key:", sample.originalKey);
    console.info("Cent correction:", sample.pitchCorrection);
    console.info("Compressed:", sample.isCompressed);
    console.info(
        "Sample link",
        sample.linkedSample ? sample.linkedSample.name : "unlinked"
    );
    console.info(
        "Linked instruments:",
        sample.linkedTo.map((i) => i.name).join(", ")
    );
    console.groupEnd();
});
console.groupEnd();
