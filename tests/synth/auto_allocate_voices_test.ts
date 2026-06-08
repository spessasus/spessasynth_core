import {
    audioToWav,
    BasicMIDI,
    SoundBankLoader,
    SpessaLog,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "../../src";
import * as fs from "node:fs/promises";

// Process arguments
const args = process.argv.slice(2);
if (args.length < 2) {
    console.info("Usage: tsx index.ts <soundbank path> <midi path>");
    process.exit();
}
const sfPath = args[0];
const midPath = args[1];

const sf = await fs.readFile(sfPath);
const mid = await fs.readFile(midPath);

const sampleRate = 44_100;
SpessaLog.setLogLevel(true, true, true);
console.info("Initializing synthesizer...");
const synth = new SpessaSynthProcessor(sampleRate, {
    eventsEnabled: false
});
synth.soundBankManager.addSoundBank(
    SoundBankLoader.fromArrayBuffer(sf.buffer),
    "main"
);
await synth.processorInitialized;

// Test code here (internal access only so we can do that)
synth.setSystemParameter("voiceCap", 1);
synth.midiChannels[0].synthCore.voices.length = 1;
synth.setSystemParameter("autoAllocateVoices", true);

console.info("Parsing MIDI file...");
const midi = BasicMIDI.fromArrayBuffer(mid.buffer);
console.info(`Now playing: ${midi.getName()}`);
const seq = new SpessaSynthSequencer(synth);
seq.loadNewSongList([midi]);
seq.play();
seq.loopCount = Infinity;

const bufSize = 128;
// Prepare the output buffers
const sampleCount = Math.ceil(sampleRate * (midi.duration + 2));
const outLeft = new Float32Array(sampleCount);
const outRight = new Float32Array(sampleCount);

let filledSamples = 0;
let i = 0;
const durationRounded = Math.floor(seq.midiData!.duration * 100) / 100;
while (filledSamples < sampleCount) {
    // Process sequencer
    seq.processTick();
    // Render
    const bufferSize = Math.min(bufSize, sampleCount - filledSamples);
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

const wave = audioToWav([outLeft, outRight], sampleRate);
await fs.writeFile("result.wav", new Uint8Array(wave));
console.info(`File written to result.wav`);
