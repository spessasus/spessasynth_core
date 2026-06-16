# Getting started with `spessasynth_core`

!!! Tip

    If you encounter any errors in this documentation, please **open an issue!**

## `spessasynth_core` vs `spessasynth_lib`

There are two similar libraries: `spessasynth_lib` and `spessasynth_core`:

- `spessasynth_core` is the main library that contains all MIDI, SF2,DLS parsing and synthesis engine. It can run in any JS environment.
- `spessasynth_lib` builds on top of `spessasynth_core`,
  relying on `WebAudioAPI` and `WebMIDIAPI`
  to add easy-to-use wrappers for the `SpessaSynthProcessor` and `SpessaSynthSequencer`.

So:

### Use `spessasynth_lib` if:

- You want to play MIDI files in the browser without much work.
- You don't want to have to program your own audio processor.
- The default effects are good enough for you.
- You don't need direct access to the audio engine.

### Use `spessasynth_core` if:

- You want access to raw PCM samples.
- You want custom effect processors.
- You need full control over the audio.
- You don't need `spessasynth_lib` wrappers.
- You don't have access to the WebAudioAPI.

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

Check out the [`.process()` method](../spessa-synth-processor/index.md#process) for more information.

## Examples

You can find all examples in the `examples` directory in this repository.

!!! Note

    To run these examples, run `npm run install:examples` in the root directory.

### MIDI to WAV converter

Here is what this code does:

- Import necessary modules
- Read the files passed to the command line
- Parse the binary file buffers
- Initialize the synthesizer
- Initialize the sequencer
- Initialize the output buffers
- Render loop:
    - Process sequencer
    - Render `BUFFER_SIZE` samples into the output buffers
    - Log progress
- Convert to WAV and save

```ts title='midi_to_wav_node.ts'
--8<-- "midi_to_wav_node.ts"
```
