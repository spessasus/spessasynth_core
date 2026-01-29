---
hide:
    - navigation
    - toc
---

# Welcome to the spessasynth_core wiki!

You've reached the central documentation for the spessasynth_core library, a powerful SF2/DLS/MIDI TypeScript/JavaScript library.

_If you're looking for the SpessaSynth web app, it can be found [here](https://spessasus.github.io/SpessaSynth)._

## Table of contents

!!! DANGER

    SpessaSynth 3.27 and below is no longer supported!
    [The migration guide for 4.0 is available here.](extra/4-0-migration-guide.md)

- [Getting started with spessasynth_core](getting-started/index.md)
- [SpessaSynthProcessor](spessa-synth-processor/index.md) - Responsible for generating sound.
- [SpessaSynthSequencer](spessa-synth-sequencer/index.md) - Responsible for playing MIDI sequences.
- [Sound Banks](sound-bank/index.md) - Responsible for parsing an SF2 file.
- [MIDI parser](midi/index.md) - Responsible for parsing a MIDI file.
- [Logging](extra/console-output.md) - How to control spessasynth_core's console output.
- [Writing MIDI files](writing-files/midi.md) - How to write MIDI and RMID files.
- [Writing Wave files](writing-files/wav.md) - How to write WAV files from PCM audio data.
- [Converting between formats](writing-files/converting-between-formats.md) - How to convert between various file
  formats.
- [MIDI Implementation](extra/midi-implementation.md) - A MIDI Implementation chart for spessasynth's
  synthesizer. This describes all the features of the synthesis engine.

### Extra Info

- [SF2 RMIDI Extension Specification](https://github.com/spessasus/sf2-rmidi-specification) - The specification for the
  SF2 RMIDI format that spessasynth supports.
- [Multi-Port files explained](extra/about-multi-port.md) - Explanation of the Multi-Port MIDI feature.
- [The DLS Conversion problem](extra/dls-conversion-problem.md) - The limits of the SF2 → DLS conversion.
- [NPM Exports](extra/all-npm-exports.md) - a listing of all the NPN exports in the `spessasynth_core` NPM package.

!!! Tip

    If you encounter any errors in this documentation, please **open an issue!**
