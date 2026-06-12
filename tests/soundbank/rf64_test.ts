import { BasicSoundBank, SoundBankLoader } from "../../src";
import fs from "node:fs/promises";

const args = process.argv.slice(2);
if (args.length !== 2) {
    console.info("Usage: tsx index.ts <sfe input path> <sfe output path>");
    process.exit();
}

const sfeIn = args[0];
const sfeOut = args[1];

await BasicSoundBank.isSF3DecoderReady;

const sfe = await fs.readFile(sfeIn);
const bank = SoundBankLoader.fromArrayBuffer(sfe.buffer);
console.info("Sound bank type:", bank.type);

// Reparse and write again
const bank2 = SoundBankLoader.fromArrayBuffer(
    bank.writeSFE({
        software: bank.soundBankInfo.software
    })
);
const bin2 = bank2.writeSFE({
    software: bank.soundBankInfo.software
});
await fs.writeFile(sfeOut, new Uint8Array(bin2));
console.info(`File written to ${sfeOut}`);
