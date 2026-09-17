# This is the MIDI file test folder.

The code here contains MIDI test generators and the tools used
to render their output using `spessasynth_core` and reference VST plugins.

- `tests` contains actual MIDI test generators grouped by features.
- `config.ts` contains render paths and the VST renderer configuration. _Adjust this if necessary!_
- `midi_test_maker.ts` contains the shared MIDI test builder used across the entire test suite.
- `generate_midi.ts` generates all MIDI test files and places them into `output/midi`.
- `render_audio.ts` renders the generated MIDI with `spessasynth_core` and the
  configured VST targets, writing results to `output/wav`, grouped by test.
- `clean.ts` removes generated files and build artifacts.
- `renderer` contains the native VST C++ renderer using the BASS library.

## Scripts

- `test:midi:render` - complete MIDI and wav generation, with full setup.
- `test:midi:generate` - just the MIDI files.
- `test:midi:clean` - clean all artifacts.
- `build:renderer` - builds the VST renderer.

## Needed files for `test:midi:render`

The spessasynth requires a sound bank,
configured to be at `tests/files/sound_bank/midi_render.sf2`.
An acceptable result can be achieved by using `gm.dls` and renaming it to above.

VST rendering requires Wine plus MinGW-w64 on Linux (`mingw-w64-gcc` on Arch),
or Visual Studio C++ tools on Windows.

By default, the following VSTs are configured:

- `tests/files/vst/SOUND Canvas VA.dll` for `x64`
- `tests/files/vst/syxg50.dll` for `x86` (multithreaded)
