import * as fs from "node:fs";
import { MIDI } from "../../src/midi/midi_loader.js";
import { SpessaSynthProcessor } from "../../src/synthetizer/audio_engine/main_processor.js";
import { SpessaSynthSequencer } from "../../src/sequencer/sequencer_engine.js";
import { audioToWav } from "../../src/utils/buffer_to_wav.js";

const args = process.argv.slice(2);

if (args.length !== 3)
{
    console.log("Usage: node index.js <soundfont path> <midi path> <wav output path>");
    process.exit();
}

const sfPath = args[0];
const midPath = args[1];
const wavPath = args[2];

console.log(sfPath, midPath, wavPath);

const sf = fs.readFileSync(sfPath);
const mid = fs.readFileSync(midPath);

const midi = new MIDI(mid);

const sampleRate = 44100;
const sampleCount = 44100 * (midi.duration + 2);

const synth = new SpessaSynthProcessor(
    sf,
    sampleRate,
    {},
    false,
    false
);

await synth.processorInitialized;

const seq = new SpessaSynthSequencer(synth);
seq.loadNewSongList([midi]);
seq.loop = false;

const outLeft = new Float32Array(sampleCount);
const outRight = new Float32Array(sampleCount);

const start = performance.now();
let filledSamples = 0;
const bufSize = 128;
let i = 0;
while (filledSamples + bufSize < sampleCount)
{
    const bufLeft = new Float32Array(bufSize);
    const bufRight = new Float32Array(bufSize);
    seq.processTick();
    const arr = [bufLeft, bufRight];
    synth.renderAudio(arr, arr, arr);
    outLeft.set(bufLeft, filledSamples);
    outRight.set(bufRight, filledSamples);
    filledSamples += bufSize;
    i++;
    if (i % 100 === 0)
    {
        console.log("Rendered", seq.currentTime, "/", midi.duration);
    }
}

console.log("Rendered in", Math.floor(performance.now() - start), "ms");

const wave = audioToWav({
    leftChannel: outLeft,
    rightChannel: outRight,
    sampleRate: sampleRate
});

fs.writeFileSync(wavPath, new Buffer(wave));
process.exit();