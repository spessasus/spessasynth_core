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

Spessasynth*core provides very \_raw* access to the audio data, outputting float PCM samples.
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
--8<-- "midi_to_wav_node.ts"
```
