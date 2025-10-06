import {
    BasicMIDI,
    BasicSoundBank,
    SoundBankLoader,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "../src";
import * as fs from "fs/promises";
import { formatTime } from "../src/utils/other";

// Process arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
    console.info("Usage: tsx index.ts<midi path>");
    process.exit();
}
const midPath = args[0];

const mid = await fs.readFile(midPath);

const sfFile = await BasicSoundBank.getSampleSoundBankFile();
// const sfFile = (
//     await fs.readFile(
//         "/home/spessasus/htdocs/SpessaSynth/soundfonts/SpessaSynthGMGS.sf3"
//     )
// ).buffer;

const sampleRate = 44100;
const synth = new SpessaSynthProcessor(sampleRate, {
    enableEffects: false
});
synth.soundBankManager.addSoundBank(
    SoundBankLoader.fromArrayBuffer(sfFile),
    "main"
);
await synth.processorInitialized;
const seq = new SpessaSynthSequencer(synth);

console.info("Engine initialized, loading MIDI...");
console.time("MIDI parsed in");
const midi = BasicMIDI.fromArrayBuffer(mid.buffer as ArrayBuffer);
console.timeEnd("MIDI parsed in");
console.time("New song loaded in");
seq.loadNewSongList([midi]);
console.timeEnd("New song loaded in");
console.info(
    `Duration: ${midi.duration} seconds = ${formatTime(midi.duration).time}`
);
