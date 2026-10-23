---
title: Welcome to the spessasynth_core wiki!
---

# Welcome to the spessasynth_core wiki!

<p align='center'>
<img src='https://raw.githubusercontent.com/spessasus/SpessaSynth/refs/heads/master/src/website/spessasynth_logo_rounded.png' width='300' alt='SpessaSynth logo'>
</p>

You've reached the central documentation for the spessasynth_core library, a powerful SF2/DLS/MIDI TypeScript/JavaScript library.

_If you're looking for the SpessaSynth web app, it can be found [here](https://spessasus.github.io/SpessaSynth)._

## Table of contents

> **DANGER**
>
> SpessaSynth below `4.4.0` is no longer supported!
> Please consider updating to get the best performance and latest features.

### Getting Started

- [Getting started with `spessasynth_core`](getting-started/index.md)

### Main Classes

- {@link SpessaSynthProcessor} - Responsible for generating sound.
- {@link SpessaSynthSequencer} - Responsible for playing MIDI sequences.
- {@link BasicSoundBank} - Responsible for parsing an SF2 file.
- {@link BasicMIDI} - Responsible for parsing a MIDI file.

### Other Useful API Docs

- [MIDI Implementation](extra/midi-implementation.md) - A MIDI Implementation chart for `spessasynth_core`'s
  synthesizer. This describes all the features of the synthesis engine.
- [Modulator Information](extra/modulator-information.md) - Information on `spessasynth_core`'s SF2 modulator implementation.
- [Kinds Of Parameters](extra/kinds-of-parameters.md) - `spessasynth_core`'s parameters explained.
- {@link SpessaLog Console Output} - How to control `spessasynth_core`'s console output.
- {@link MIDIUtils MIDI Utilities} - Useful MIDI SysEx utilites.
- {@link MIDIBuilder Writing MIDI files} - How to create MIDI files from scratch.
- {@link audioToWav Writing Wave files} - How to write WAV files from PCM audio data.

### Extra Info

- [SF2 RMIDI Extension Specification](https://github.com/spessasus/sf2-rmidi-specification) - The specification for the
  SF2 RMIDI format that spessasynth supports.
- [Multi-Port files explained](extra/about-multi-port.md) - Explanation of the Multi-Port MIDI feature.
- [The DLS Conversion problem](extra/dls-conversion-problem.md) - The limits of the SF2 → DLS conversion.
- [Converting between formats](extra/converting-between-formats.md) - How to convert between various file
  formats.
- [Contributing to `spessasynth_core`](extra/developer-docs.md)

> **Tip**
>
> If you encounter any errors in this documentation, please **open an issue!**
