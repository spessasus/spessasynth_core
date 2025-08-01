---
hide:
  - navigation
  - toc
---

# Welcome to the spessasynth_core wiki!

This should serve as the complete documentation of the library.
(And my attempt to explain the program :-)

!!! DANGER

    The next major update (4.0) will include many breaking changes. 
    The documentation will be updated when the update releases
    [The migration guide is available.](extra/4-0-migration-guide.md)


!!! Tip

    If you encounter any errors in this documentation, please **open an issue!**

## Documentation

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

## Extra Info

- [SF2 RMIDI Extension Specification](https://github.com/spessasus/sf2-rmidi-specification) - The specification for the
  SF2 RMIDI format that spessasynth supports.
- [SpessaSynth's MIDI Implementation](extra/midi-implementation.md) - A MIDI Implementation chart for spessasynth's
  synthesizer.
- [Multi-Port files explained](extra/about-multi-port.md) - Explanation of the Multi-Port MIDI feature.
- [The DLS Conversion problem](extra/dls-conversion-problem.md) - The limits of the SF2 -> DLS conversion.
- [NPM Exports](extra/all-npm-exports.md) - a listing of all the NPN exports in the `spessasynth_core` NPM package.