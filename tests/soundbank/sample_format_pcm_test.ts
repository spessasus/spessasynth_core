import { BasicSoundBank, SoundBankLoader } from "../../src";

// Checks that setSampleFormat("pcm") leaves uncompressed samples alone.
// The stored s16le data should then be written as it is, without a Float32 decode

await BasicSoundBank.ready;

const bank = SoundBankLoader.fromArrayBuffer(
    BasicSoundBank.getSampleSoundBankFile()
);
const sample = bank.samples[0];
const before = sample.getRawData(false);

await bank.setSampleFormat({ format: "pcm" });

const after = sample.getRawData(false);
// The same array means the sample still holds its original data
const untouched = before === after;
console.info(
    `${untouched ? "PASS" : "FAIL"}: an uncompressed sample keeps its stored data`
);

// The written file still has the same data
const reloaded = SoundBankLoader.fromArrayBuffer(bank.writeSF2());
const written = reloaded.samples[0].getRawData(false);
const same =
    written.length === before.length &&
    written.every((b, i) => b === before[i]);
console.info(`${same ? "PASS" : "FAIL"}: the written sample data is unchanged`);

if (!untouched || !same) {
    console.error("Some checks failed.");
    process.exit(1);
}
console.info("All checks passed.");
