# Getting started

## Installation

```shell
npm install --save spessasynth_core
```

## Minimal Setup

A minimal setup for the synthesizer involves two lines of code:

```ts
const synth = new SpessaSynthProcessor();
synth.soundBankManager.addSoundBank(arrayBuffer, "main");
```

## Understanding the audio loop

Spessasynth_core provides very *raw* access to the audio data, outputting float PCM samples.
These samples can then be sent to speakers, saved somewhere or processed, for example in an `AudioWorklet`'s [`process` method](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process).

### Example MIDI player audio loop

Here is the most basic audio loop for the synthesizer and sequencer:

```ts
const bufferSize = 128;
while (true) {
    sequencer.processTick();
    const samplesL = new Float32Array(bufferSize);
    const samplesR = new Float32Array(bufferSize);
    const reverbL = new Float32Array(bufferSize);
    const reverbR = new Float32Array(bufferSize);
    const chorusL = new Float32Array(bufferSize);
    const chorusR = new Float32Array(bufferSize);
    processor.renderAudio(
        [samplesL, samplesR],
        [reverbL, reverbR],
        [chorusL, chorusR]
    );
    // process the audio here
}
```

This loop processes the sequencer before rendering the audio to the buffers.
Note that spessasynth_core does not provide audio effects, so you will have to supply your own.

Also keep in mind that the buffer size should not be larger than 256,
as the renderAudio function calculates the envelopes and LFOs once,
so buffer size represents the shortest amount of time between those changes.

To use a larger buffer, you can do:

```ts
// divisible by 128
const dry = [new Float32Array(2048), new Float32Array(2048)];
const reverb = [new Float32Array(2048), new Float32Array(2048)];
const chorus = [new Float32Array(2048), new Float32Array(2048)];
// 2048 / 128 = 16;
for (let i = 0; i < 16; i++) {
    // start rendering at a given offset and render 128 samples
    processor.renderAudio(dry, reverb, chorus, i * 128, 128);
}
```

Check out the [renderAudio method](../spessa-synth-processor/index.md#renderaudio) for more information.

## Examples

You can find all examples in the `examples` directory in this repository.
Note that `midi_player_node` requires the `speaker` package to be installed (`npm install speaker`)

### MIDI to WAV converter

Here is what this code does:

- Import necessary modules
- Read the files passed to the command line
- Initialize the processor
- Initialize the sequencer
- Initialize the output buffers
- Render loop:
    - Process sequencer
    - Initialize buffer arrays
    - Render out
    - Fill the output arrays
- Convert to WAV and save

```ts
import * as fs from "node:fs";
import {
    audioToWav,
    BasicMIDI,
    SoundBankLoader,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "spessasynth_core";

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

```