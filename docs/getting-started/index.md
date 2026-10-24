---
title: Getting started with spessasynth_core
---

# Getting started with <code>spessasynth_core</code>

> **Tip**
>
> If you encounter any errors in this documentation, please [**open an issue!**](https://github.com/spessasus/spessasynth_core/issues)

## <code>spessasynth_core</code> vs <code>spessasynth_lib</code>

There are two similar libraries: `spessasynth_lib` and `spessasynth_core`:

- `spessasynth_core` is the main library that contains all the MIDI, SF2 and DLS parsing and the synthesis engine. It can run in any JS environment.
- `spessasynth_lib` builds on top of `spessasynth_core`,
  relying on `WebAudioAPI` and `WebMIDIAPI`
  to add easy-to-use wrappers for the `SpessaSynthProcessor` and `SpessaSynthSequencer`.

So:

### Use <code>spessasynth_lib</code> if:

- You want to play MIDI files in the browser without much work.
- You don't want to have to program your own audio processor.
- The default effects are good enough for you.
- You don't need direct access to the audio engine.

### Use <code>spessasynth_core</code> if:

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

A minimal setup for the synthesizer involves parsing a sound bank and adding it to a new synthesizer:

```ts
import { SoundBankLoader, SpessaSynthProcessor } from "spessasynth_core";

// `soundBankBuffer` is an ArrayBuffer containing an SF2, SF3 or DLS file
const soundBank = SoundBankLoader.fromArrayBuffer(soundBankBuffer);
const synth = new SpessaSynthProcessor(48_000); // Sample rate in Hertz
synth.soundBankManager.addSoundBank(soundBank, "main");
await synth.ready;
```

## Understanding the audio loop

`spessasynth_core` provides very _raw_ access to the audio data, outputting float PCM samples.
These samples can then be sent to speakers, saved somewhere or processed, for example in an `AudioWorklet`'s [`process` method](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process).

### Example MIDI player audio loop

Here is the most basic audio loop for the synthesizer and sequencer,
continuing from the minimal setup above:

```ts
import { BasicMIDI, SpessaSynthSequencer } from "spessasynth_core";

// `midiBuffer` is an ArrayBuffer containing a MIDI file
const sequencer = new SpessaSynthSequencer(synth);
sequencer.loadNewSongList([BasicMIDI.fromArrayBuffer(midiBuffer)]);
sequencer.play();

const bufferSize = 128;
// Allocate the buffers once and reuse them
const samplesL = new Float32Array(bufferSize);
const samplesR = new Float32Array(bufferSize);
while (true) {
    sequencer.processTick();
    // The synthesizer mixes into the buffers, so clear them first
    samplesL.fill(0);
    samplesR.fill(0);
    synth.process(samplesL, samplesR);
    // Send the audio somewhere here
}
```

This loop processes the sequencer before rendering the audio to the buffers.

Also keep in mind that a single `process` call cannot render more than
{@link SynthProcessorOptions.maxBufferSize `maxBufferSize`} samples (128 by default, larger values throw an error),
as the `process` function calculates the envelopes and LFOs once,
so buffer size represents the shortest amount of time between those changes.

To fill a larger buffer, render it in chunks:

```ts
// Divisible by 128
const outL = new Float32Array(2048);
const outR = new Float32Array(2048);
// 2048 / 128 = 16
for (let i = 0; i < 16; i++) {
    // Start rendering at a given offset and render 128 samples
    synth.process(outL, outR, i * 128, 128);
}
```

Check out {@link SpessaSynthProcessor.process} for more information.

## Examples

You can find all examples in the `examples` directory in this repository.

> **Note**
>
> To run these examples, run `npm install` in the `examples` directory,
> then run an example with `npx tsx examples/<example name>.ts` from the root directory.

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
