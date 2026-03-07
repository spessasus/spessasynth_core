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

`spessasynth_core` provides very _raw_ access to the audio data, outputting float PCM samples.
These samples can then be sent to speakers, saved somewhere or processed, for example in an `AudioWorklet`'s [`process` method](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process).

### Example MIDI player audio loop

Here is the most basic audio loop for the synthesizer and sequencer:

```ts
const bufferSize = 128;
while (true) {
    sequencer.processTick();
    const samplesL = new Float32Array(bufferSize);
    const samplesR = new Float32Array(bufferSize);
    processor.process(samplesL, samplesR);
    // process the audio here
}
```

This loop processes the sequencer before rendering the audio to the buffers.

Also keep in mind that the buffer size should not be larger than 256,
as the `process` function calculates the envelopes and LFOs once,
so buffer size represents the shortest amount of time between those changes.

To use a larger buffer, you can do:

```ts
// divisible by 128
const outL = new Float32Array(2048);
const outR = new Float32Array(2048);
// 2048 / 128 = 16;
for (let i = 0; i < 16; i++) {
    // start rendering at a given offset and render 128 samples
    processor.process(outL, outR, i * 128, 128);
}
```

Check out the [processo method](../spessa-synth-processor/index.md#process) for more information.

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
--8<-- "midi_to_wav_node.ts"
```
