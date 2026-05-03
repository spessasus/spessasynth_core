import {
    BasicMIDI,
    MIDIPatchTools,
    type RMIDInfoData,
    SoundBankLoader,
    SpessaSynthLogging
} from "../src";
import fs from "fs/promises";

const args = process.argv.slice(2);
if (args.length !== 2) {
    console.info("Usage: tsx index.ts <sf path> <midi path>");
    process.exit();
}

const sbkPath: string = args[0];
const midPath: string = args[1];
console.time("Parsed sound bank in");
const sbk = SoundBankLoader.fromArrayBuffer(
    (await fs.readFile(sbkPath)).buffer
);
console.timeEnd("Parsed sound bank in");
SpessaSynthLogging(true, true, true);
console.time("Parsed MIDI file in");
const mid = BasicMIDI.fromArrayBuffer((await fs.readFile(midPath)).buffer);
console.timeEnd("Parsed MIDI file in");

const used = mid.getUsedProgramsAndKeys(sbk);

console.group("\n\n\n--- MIDI File Analysis ---");
console.info("Name:", mid.getName());
console.info("Duration:", mid.duration);
console.info("Time division:", mid.timeDivision);
console.info("Track count:", mid.tracks.length);
console.info("Lyric count:", mid.lyrics.length);
console.info("Bank offset:", mid.bankOffset);

console.group("--- Extra Metadata ---");
for (const meta of mid.getExtraMetadata()) console.info(meta);
console.groupEnd();
console.info("---");

console.group("--- RMIDI Metadata ---");
for (const key of Object.keys(mid.rmidiInfo))
    console.info(`${key}:`, mid.getRMIDInfo(key as keyof RMIDInfoData));
console.groupEnd();
console.info("---");

console.group("--- Used Programs ---");
for (const [preset, keys] of used)
    console.info(
        MIDIPatchTools.toNamedMIDIString(preset).padEnd(30, " "),
        `-> ${keys.size} key combinations detected.`
    );
console.groupEnd();
console.info("---");

console.groupEnd();
console.info("---");
