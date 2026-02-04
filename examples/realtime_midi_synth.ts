import midi from "midi";
import Speaker from "speaker";
import { SoundBankLoader, SpessaSynthProcessor } from "../src";
import * as fs from "node:fs/promises";

// Process arguments
const args = process.argv.slice(2);
if (args.length < 1) {
    console.info("Usage: tsx index.ts <soundbank path>");
    process.exit();
}
// Initialize the synthesizer
const sampleRate = 44100;
console.info("Initializing synthesizer...");
const sfPath = args[0];
const sf = await fs.readFile(sfPath);
const synth = new SpessaSynthProcessor(sampleRate, {
    enableEventSystem: false
});
synth.soundBankManager.addSoundBank(
    SoundBankLoader.fromArrayBuffer(sf.buffer as ArrayBuffer),
    "main"
);
await synth.processorInitialized;

// Initialize the MIDI inputs
const input = new midi.Input();
input.ignoreTypes(false, false, false);
console.info("Listening on port ");
console.info(input.getPortName(0));
input.openPort(0);
input.on("message", (_deltaTime, message) => {
    synth.processMessage(message);
});

const speaker = new Speaker({
    sampleRate: sampleRate,
    channels: 2,
    bitDepth: 32,
    // @ts-expect-error badly typed package (again)
    float: true
});

// Initialize the audio stream
const quantum = 128;
const blockSize = 4;
const left = new Float32Array(quantum * blockSize);
const right = new Float32Array(quantum * blockSize);

let startTime = performance.now();
setInterval(() => {
    const t = (performance.now() - startTime) / 1000;
    if (synth.currentSynthTime - t > 0.5) {
        return;
    }
    left.fill(0);
    right.fill(0);
    let write = 0;
    for (let i = 0; i < blockSize; i++) {
        synth.process(left, right, write, quantum);
        write += quantum;
    }

    const interleaved = new Float32Array(left.length * 2);
    for (let i = 0; i < left.length; i++) {
        interleaved[i * 2] = left[i];
        interleaved[i * 2 + 1] = right[i];
    }

    const buffer = Buffer.alloc(interleaved.length * 4); // 4 bytes per float
    for (let i = 0; i < interleaved.length; i++) {
        buffer.writeFloatLE(interleaved[i], i * 4);
    }
    speaker.write(buffer);
});
