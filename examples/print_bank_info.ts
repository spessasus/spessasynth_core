// Process arguments
import * as fs from "node:fs/promises";
import { BasicSoundBank, SoundBankLoader } from "../src";

const args = process.argv.slice(2);
if (args.length !== 1) {
    console.info("Usage: tsx index.ts <sf2/dls input path>");
    process.exit();
}

const filePath = args[0];
const file = await fs.readFile(filePath);
await BasicSoundBank.isSF3DecoderReady;
const bank = SoundBankLoader.fromArrayBuffer(file.buffer);
console.info("Loaded bank:", bank.soundBankInfo.name);

console.group("Bank information");
const info = bank.soundBankInfo;
console.info(`Name: ${info.name}`);
console.info(`Version: ${info.version.major}.${info.version.minor}`);
console.info(`Creation date: ${info.creationDate.toISOString()}`);
console.info(`Sound engine: ${info.soundEngine}`);
if (info.engineer) console.info(`Engineer: ${info.engineer}`);
if (info.product) console.info(`Product: ${info.product}`);
if (info.copyright) console.info(`Copyright: ${info.copyright}`);
if (info.comment) console.info(`Comment: ${info.comment}`);
if (info.software) console.info(`Software: ${info.software}`);
if (info.subject) console.info(`Subject: ${info.subject}`);
if (info.romInfo) console.info(`ROM info: ${info.romInfo}`);
if (info.romVersion)
    console.info(
        `ROM version: ${info.romVersion.major}.${info.romVersion.minor}`
    );

console.info(`\nPreset count: ${bank.presets.length}`);
console.info(`Instrument count: ${bank.instruments.length}`);
console.info(`Sample count: ${bank.samples.length}`);
console.groupEnd();

console.group("Preset data:");
for (const preset of bank.presets) {
    console.group(`\n--- ${preset.toString()} ---`);

    console.group("Zones:");
    console.info("\n--- Global Zone ---");
    console.info("Key range:", preset.globalZone.keyRange);
    console.info("Velocity range:", preset.globalZone.velRange);

    for (const zone of preset.zones) {
        console.info(`\n--- ${zone?.instrument?.name} ---`);
        console.info("Key range:", zone.keyRange);
        console.info("Velocity range:", zone.velRange);
    }
    console.groupEnd();
    console.groupEnd();
}
console.groupEnd();

console.group("Instrument data:");
for (const inst of bank.instruments) {
    console.group(`\n--- ${inst.name} ---`);
    console.info(
        "Linked presets:",
        inst.linkedTo.map((p) => p.name).join(", ")
    );

    console.group("Zones:");
    console.info("\n--- Global Zone ---");
    console.info("Key range:", inst.globalZone.keyRange);
    console.info("Velocity range:", inst.globalZone.velRange);

    for (const zone of inst.zones) {
        console.info(`\n--- ${zone.sample.name} ---`);
        console.info("Key range:", zone.keyRange);
        console.info("Velocity range:", zone.velRange);
    }
    console.groupEnd();
    console.groupEnd();
}
console.groupEnd();

console.group("Sample data:");
for (const sample of bank.samples) {
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
}
console.groupEnd();
