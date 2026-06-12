import { BasicSoundBank, SoundBankLoader } from "../../src";
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
console.info("Convert to sfe64 and parse");
const bank2 = SoundBankLoader.fromArrayBuffer(
    bank.writeSFE({
        software: bank.soundBankInfo.software
    })
);
console.info("Sound bank type 2:", bank2.type);
console.info("Convert to sf2");
const bin2 = bank2.writeSF2({
    software: bank.soundBankInfo.software
});
await fs.writeFile(sf2Out, new Uint8Array(bin2));
console.info(`File written to ${sf2Out}`);
