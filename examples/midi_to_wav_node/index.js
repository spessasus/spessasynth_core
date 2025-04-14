import * as fs from "node:fs";
import { MIDI } from "../../src/midi/midi_loader.js";
import { SpessaSynthProcessor } from "../../src/synthetizer/audio_engine/main_processor.js";
import { SpessaSynthSequencer } from "../../src/sequencer/sequencer_engine.js";
import { audioToWav } from "../../src/utils/buffer_to_wav.js";

// process arguments
const args = process.argv.slice(2);
if (args.length !== 3)
{
    console.log("Usage: node index.js <soundfont path> <midi path> <wav output path>");
    process.exit();
}
const sfPath = args[0];
const midPath = args[1];
const wavPath = args[2];

// load the files
const sf = fs.readFileSync(sfPath);
const mid = fs.readFileSync(midPath);

// parse the MIDI file
const midi = new MIDI(mid);

// calculate the sample data
const sampleRate = 44100;
const sampleCount = 44100 * (midi.duration + 2);

// initialize the synthesizer
const synth = new SpessaSynthProcessor(
    sf,
    sampleRate,
    {},
    false,
    false
);

// wait for it to be ready
await synth.processorInitialized;

// initialize the sequencer
const seq = new SpessaSynthSequencer(synth);
seq.loadNewSongList([midi]);
seq.loop = false;

// prepare the outputs
const outLeft = new Float32Array(sampleCount);
const outRight = new Float32Array(sampleCount);

const start = performance.now();
let filledSamples = 0;
// note: buffer size is recommended to be very small, as this is the interval between modulator updates and LFO updates
const bufSize = 128;
let i = 0;
while (filledSamples + bufSize < sampleCount)
{
    const bufLeft = new Float32Array(bufSize);
    const bufRight = new Float32Array(bufSize);
    // process sequencer
    seq.processTick();
    const arr = [bufLeft, bufRight];
    // render
    synth.renderAudio(arr, arr, arr);
    // write out
    outLeft.set(bufLeft, filledSamples);
    outRight.set(bufRight, filledSamples);
    filledSamples += bufSize;
    i++;
    // log progress
    if (i % 100 === 0)
    {
        console.log("Rendered", seq.currentTime, "/", midi.duration);
    }
}

console.log("Rendered in", Math.floor(performance.now() - start), "ms");

// convert to wave and write
const wave = audioToWav({
    leftChannel: outLeft,
    rightChannel: outRight,
    sampleRate: sampleRate
});
fs.writeFileSync(wavPath, new Buffer(wave));
process.exit();