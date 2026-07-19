import {
    BasicPreset,
    BasicPresetZone,
    BasicSoundBank,
    SoundBankLoader,
    SpessaLog
} from "../../src";
import fs from "node:fs/promises";

const args = process.argv.slice(2);
if (args.length !== 2) {
    console.info("Usage: tsx index.ts <sf2 input path> <sf2 output path>");
    process.exit();
}

const sf2In = args[0];
const sf2Out = args[1];

await BasicSoundBank.isSF3DecoderReady;

const sf2 = await fs.readFile(sf2In);
const bank = SoundBankLoader.fromArrayBuffer(sf2.buffer);
console.info("Sound bank type:", bank.type);

// Write as 64 -> parse -> write as 32
console.info("flatten instruments");
SpessaLog.setLogLevel(true, true, true);

const flattened = new BasicSoundBank("sf2");
flattened.soundBankInfo = { ...bank.soundBankInfo };
for (const preset of bank.presets) {
    const flat = preset.toFlattenedInstrument();
    const inst = flattened.cloneInstrument(flat);
    const flatPreset = new BasicPreset(flattened);
    flatPreset.name = preset.name;
    flatPreset.bankLSB = preset.bankLSB;
    flatPreset.bankMSB = preset.bankMSB;
    flatPreset.program = preset.program;
    flatPreset.isGMGSDrum = preset.isGMGSDrum;
    flatPreset.zones.push(new BasicPresetZone(flatPreset, inst));
    flattened.addPresets(flatPreset);
}
flattened.flush();

const out = flattened.writeSF2();

await fs.writeFile(sf2Out, new Uint8Array(out));
console.info(`File written to ${sf2Out}`);
