import * as fs from "node:fs";
import { MIDI } from "../../src/midi/midi_loader.js";
import { SpessaSynthProcessor } from "../../src/synthetizer/audio_engine/main_processor.js";
import { SpessaSynthSequencer } from "../../src/sequencer/sequencer_engine.js";
import { audioToWav } from "../../src/utils/buffer_to_wav.js";
import { loadSoundFont } from "../../src/soundfont/load_soundfont.js";

// process arguments
const args = process.argv.slice(2);
if (args.length !== 3)
{
    console.log("Usage: node index.js <soundfont path> <midi path> <wav output path>");
    process.exit();
}
const sf = fs.readFileSync(args[0]);
const mid = fs.readFileSync(args[1]);
const midi = new MIDI(mid);
const sampleRate = 44100;
const sampleCount = 44100 * (midi.duration + 2);
const synth = new SpessaSynthProcessor(sampleRate, {
    enableEventSystem: false,
    effectsEnabled: false
});
synth.soundfontManager.reloadManager(loadSoundFont(sf));
await synth.processorInitialized;
const seq = new SpessaSynthSequencer(synth);
seq.loadNewSongList([midi]);
seq.loop = false;
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
        console.log("Rendered", Math.floor(seq.currentTime * 100) / 100, "/", midi.duration, synth.totalVoicesAmount);
    }
}
const rendered = Math.floor(performance.now() - start);
console.log("Rendered in", rendered, `ms (${Math.floor((midi.duration * 1000 / rendered) * 100) / 100}x)`);
const wave = audioToWav({
    leftChannel: outLeft,
    rightChannel: outRight,
    sampleRate: sampleRate
});
fs.writeFileSync(args[2], new Buffer(wave));
process.exit();