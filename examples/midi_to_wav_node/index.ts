import * as fs from "node:fs";
import {
    audioToWav,
    BasicMIDI,
    SoundBankLoader,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "../../src";

// Process arguments
const args = process.argv.slice(2);
if (args.length !== 3) {
    console.info(
        "Usage: tsx index.ts <soundbank path> <midi path> <wav output path>"
    );
    process.exit();
}
const sf = fs.readFileSync(args[0]);
const mid = fs.readFileSync(args[1]);
const midi = BasicMIDI.fromArrayBuffer(mid.buffer);
const sampleRate = 44100;
const sampleCount = Math.ceil(44100 * (midi.duration + 2));
const synth = new SpessaSynthProcessor(sampleRate, {
    enableEventSystem: false,
    enableEffects: false
});
synth.soundBankManager.addSoundBank(
    SoundBankLoader.fromArrayBuffer(sf.buffer),
    "main"
);
await synth.processorInitialized;
const seq = new SpessaSynthSequencer(synth);
seq.loadNewSongList([midi]);
seq.play();

const outLeft = new Float32Array(sampleCount);
const outRight = new Float32Array(sampleCount);
const start = performance.now();
let filledSamples = 0;
// Note: buffer size is recommended to be very small, as this is the interval between modulator updates and LFO updates
const BUFFER_SIZE = 128;
let i = 0;
const durationRounded = Math.floor(seq.midiData!.duration * 100) / 100;
const outputArray = [outLeft, outRight];
while (filledSamples < sampleCount) {
    // Process sequencer
    seq.processTick();
    // Render
    const bufferSize = Math.min(BUFFER_SIZE, sampleCount - filledSamples);
    synth.renderAudio(outputArray, [], [], filledSamples, bufferSize);
    filledSamples += bufferSize;
    i++;
    // Log progress
    if (i % 100 === 0) {
        console.info(
            "Rendered",
            Math.floor(seq.currentTime * 100) / 100,
            "/",
            durationRounded
        );
    }
}
const rendered = Math.floor(performance.now() - start);
console.info(
    "Rendered in",
    rendered,
    `ms (${Math.floor(((midi.duration * 1000) / rendered) * 100) / 100}x)`
);
const wave = audioToWav([outLeft, outRight], sampleRate);
fs.writeFile(args[2], new Uint8Array(wave), () => {
    console.log(`File written to ${args[2]}`);
});
