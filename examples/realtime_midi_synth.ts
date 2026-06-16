import midi from "midi";
import { SoundBankLoader, SpessaLog, SpessaSynthProcessor } from "../src";
import * as fs from "node:fs/promises";
import * as child_process from "node:child_process";

console.info("This example needs ffmpeg to be installed on your computer.");
// Process arguments
const args = process.argv.slice(2);
if (args.length < 2) {
    console.info("Usage: tsx index.ts <soundbank path> <sample rate>");
    process.exit();
}
const sfPath = args[0];
const sampleRate = Number.parseInt(args[1]);
// Quantum size is recommended to be 128 at 48kHz, 48000 / 375 = 128
// Scale this to the selected sample rate
const quantum = Math.round(sampleRate / 375);

// Enable verbose logging
SpessaLog.setLogLevel(true, true, true);

// Initialize the synthesizer
console.info("Initializing synthesizer...");
const synth = new SpessaSynthProcessor(sampleRate, {
    eventsEnabled: false,
    maxBufferSize: quantum
});

// Load sound bank
const sf = await fs.readFile(sfPath);
synth.soundBankManager.addSoundBank(
    SoundBankLoader.fromArrayBuffer(sf.buffer),
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

// Spawn ffplay to play directly to the speakers, use flags for lower latency
const speakers = child_process.spawn(
    "ffplay",
    [
        "-fflags",
        "nobuffer",
        "-flags",
        "low_delay",
        "-f",
        "f32le",
        "-sample_rate",
        sampleRate.toString(),
        "-ch_layout",
        "stereo",
        "-nodisp",
        "-"
    ],
    {
        stdio: ["pipe"]
    }
);

// Initialize the audio stream
const left = new Float32Array(quantum);
const right = new Float32Array(quantum);

const startTime = performance.now();
setInterval(() => {
    const t = (performance.now() - startTime) / 1000;
    // Keep rendering until we are 0.1 seconds ahead of time
    while (synth.currentTime - t < 0.1) {
        left.fill(0);
        right.fill(0);
        synth.process(left, right);

        const interleaved = new Float32Array(left.length * 2);
        for (let i = 0; i < left.length; i++) {
            interleaved[i * 2] = left[i];
            interleaved[i * 2 + 1] = right[i];
        }

        const buffer = Buffer.from(
            interleaved.buffer,
            interleaved.byteOffset,
            interleaved.byteLength
        );
        speakers.stdin.write(buffer);
    }
});
