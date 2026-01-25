// Process arguments
import {
    BasicMIDI,
    SoundBankLoader,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "../src";
import fs from "fs/promises";

const args = process.argv.slice(2);
if (args.length < 2) {
    console.info("Usage: tsx index.ts <soundbank path> <midi path>");
    process.exit();
}
const sf = await fs.readFile(args[0]);
const mid = await fs.readFile(args[1]);
const midi = BasicMIDI.fromArrayBuffer(mid.buffer);
const sampleRate = 44100;
const sampleCount = Math.ceil(44100 * (midi.duration + 2));
const sbk = SoundBankLoader.fromArrayBuffer(sf.buffer);
const BUFFER_SIZE = 128;

const outLeft = new Float32Array(sampleCount);
const outRight = new Float32Array(sampleCount);
const outputArray = [outLeft, outRight];

const PASSES = 10;
let times = new Array<number>();
for (let i = 0; i < PASSES; i++) {
    const synth = new SpessaSynthProcessor(sampleRate, {
        enableEventSystem: false
    });
    synth.soundBankManager.addSoundBank(sbk, "main");
    await synth.processorInitialized;
    const seq = new SpessaSynthSequencer(synth);
    seq.loadNewSongList([midi]);
    seq.play();
    let filledSamples = 0;

    console.info(`Rendering MIDI. Pass ${i} / ${PASSES}`);
    const start = performance.now();
    while (filledSamples < sampleCount) {
        // Process sequencer
        seq.processTick();
        // Render
        const bufferSize = Math.min(BUFFER_SIZE, sampleCount - filledSamples);
        synth.renderAudio(
            outputArray,
            outputArray,
            outputArray,
            filledSamples,
            bufferSize
        );
        filledSamples += bufferSize;
    }
    const time = performance.now() - start;
    console.info(`Pass ${i}: ${Math.floor(time)}ms`);
    times.push(time);
}
let avg = times.reduce((sum, i) => sum + i, 0) / times.length;
console.info(`Average time: ${Math.floor(avg)}ms`);
