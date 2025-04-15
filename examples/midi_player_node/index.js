import { SpessaSynthProcessor } from "../../src/synthetizer/audio_engine/main_processor.js";
import * as fs from "fs";
import { SpessaSynthSequencer } from "../../src/sequencer/sequencer_engine.js";
import { MIDI } from "../../src/midi/midi_loader.js";
import { Readable } from "stream";
import Speaker from "speaker";

// process arguments
const args = process.argv.slice(2);
if (args.length !== 2)
{
    console.log("Usage: node index.js <soundfont path> <midi path>");
    process.exit();
}
const sfPath = args[0];
const midPath = args[1];

const sf = fs.readFileSync(sfPath);
const mid = fs.readFileSync(midPath);

const sampleRate = 44100;
const synth = new SpessaSynthProcessor(
    sf,
    sampleRate,
    {},
    false,
    false
);

const seq = new SpessaSynthSequencer(synth);
seq.loadNewSongList([new MIDI(mid)]);

const bufSize = 128;

const audioStream = new Readable({
    read()
    {
        const left = new Float32Array(bufSize);
        const right = new Float32Array(bufSize);
        const arr = [left, right];
        seq.processTick();
        synth.renderAudio(arr, arr, arr);
        
        
        const interleaved = new Float32Array(left.length * 2);
        for (let i = 0; i < left.length; i++)
        {
            interleaved[i * 2] = left[i];
            interleaved[i * 2 + 1] = right[i];
        }
        
        const buffer = Buffer.alloc(interleaved.length * 4); // 4 bytes per float
        for (let i = 0; i < interleaved.length; i++)
        {
            buffer.writeFloatLE(interleaved[i], i * 4);
        }
        this.push(buffer);
    }
});

const speaker = new Speaker({
    sampleRate: 44100,
    channels: 2,
    bitDepth: 32,
    float: true
});
audioStream.pipe(speaker);