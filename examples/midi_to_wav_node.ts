import * as fs from "fs/promises";
import {
    audioToWav,
    BasicMIDI,
    SoundBankLoader,
    SpessaSynthLogging,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "../src";

// Process arguments
const args = process.argv.slice(2);
if (args.length !== 3) {
    console.info(
        "Usage: tsx index.ts <soundbank path> <midi path> <wav output path>"
    );
    process.exit();
}
// Read MIDI and sound bank
const sf = await fs.readFile(args[0]);
const mid = await fs.readFile(args[1]);
// Parse the MIDI and sound bank
const midi = BasicMIDI.fromArrayBuffer(mid.buffer);
const soundBank = SoundBankLoader.fromArrayBuffer(sf.buffer);

// Initialize the synthesizer
const sampleRate = 48000;
const synth = new SpessaSynthProcessor(sampleRate, {
    enableEventSystem: false
});
synth.soundBankManager.addSoundBank(soundBank, "main");
await synth.processorInitialized;
// Enable verbose information during render
SpessaSynthLogging(true, true, true);
// Enable uncapped voice count
synth.setMasterParameter("autoAllocateVoices", true);

// Initialize the sequencer
const seq = new SpessaSynthSequencer(synth);
seq.loadNewSongList([midi]);
seq.play();

// Prepare the output buffers
const sampleCount = Math.ceil(sampleRate * (midi.duration + 2));
const outLeft = new Float32Array(sampleCount);
const outRight = new Float32Array(sampleCount);
const start = performance.now();
let filledSamples = 0;
// Note: buffer size is recommended to be very small, as this is the interval between modulator updates and LFO updates
const BUFFER_SIZE = 128;
let i = 0;
const durationRounded = Math.floor(seq.midiData!.duration * 100) / 100;
while (filledSamples < sampleCount) {
    // Process sequencer
    seq.processTick();
    // Render
    const bufferSize = Math.min(BUFFER_SIZE, sampleCount - filledSamples);
    synth.process(outLeft, outRight, filledSamples, bufferSize);
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
await fs.writeFile(args[2], new Uint8Array(wave));
console.info(`File written to ${args[2]}`);
