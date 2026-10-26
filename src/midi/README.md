## This is the MIDI folder.

The code here is responsible for reading, writing, analyzing and editing MIDI files.
All public symbols are exported through `exports.ts`.

### Core classes

- `basic_midi.ts` - `BasicMIDI`, the MIDI representation: tracks, metadata, the embedded sound bank,
  tick to time conversion, writing (`writeMIDI`, `writeRMIDI`), editing (`modify`, `applySnapshot`),
  `getNoteTimes` and `iterate`. `BasicMIDI.fromArrayBuffer` detects the file format and calls the right loader.
- `midi_track.ts` - `MIDITrack`, a single track with its events, name, port and used channels.
- `midi_message.ts` - `MIDIMessage`, a single MIDI event.
- `enums.ts` - the message types, controllers and RPN/NRPN numbers.
- `types.ts` - the shared interfaces and types.
- `drum_parameters.ts` - `DrumParameterUtils`, the default per-note drum parameters.

### Reading

The `read/` directory.

- `midi.ts` - Standard MIDI File (SMF).
- `rmidi.ts` - RIFF MIDI (RMIDI), including the embedded sound bank and the INFO chunk.
- `xmf.ts` - Extensible Music Format (XMF).
- `tracker/` - tracker modules, converted to MIDI with an embedded sound bank:
    - `load_tracker_module.ts` - detects the module format and runs the conversion.
    - `tracker_module.ts` - `TrackerModule`, the base class of all formats. Plays the module tick by tick
      (orders, rows, jumps, loops and delays), writes one MIDI track per tracker channel
      (16 channels per port, the GS rhythm part is switched to a melodic part) and creates one SF2 preset per sample.
    - `tracker_channel.ts` - `TrackerChannel`, the playback state of a channel and the effects shared between formats.
    - `tracker_midi_track.ts` - `TrackerMIDITrack`, writes the MIDI events of a channel.
      Pitch is the closest key plus the pitch wheel, with the pitch wheel range fitted per channel.
    - `tracker_pattern.ts` - `TrackerPattern`, the pattern data.
    - `types.ts` - the format-agnostic samples, instruments and envelopes.
    - `protracker.ts` - ProTracker MOD (also the base of the XM format).
    - `fasttracker.ts` - Fast Tracker 2 XM (effect memory, volume column, instruments, envelopes and automatic vibrato).
      Also reads ModPlug ADPCM and OpenMPT stereo samples, and the OpenMPT song message and artist.
    - `screamtracker.ts` - Scream Tracker 3 S3M (shared effect memory).

To add a new tracker format, extend `TrackerModule` (or an existing format) and add its detection to
`load_tracker_module.ts`.

### Writing

The `write/` directory.

- `midi.ts` - Standard MIDI File (SMF).
- `rmidi.ts` - RIFF MIDI (RMIDI) with an embedded sound bank.

### MIDI tools

The `midi_tools/` directory.

- `midi_builder.ts` - `MIDIBuilder`, inherits from `BasicMIDI`. Used for building MIDI files from scratch.
- `midi_editor.ts` - `MIDIEditor`, the event-level editor behind `BasicMIDI.modify`.
  Tracks the GS/XG/GM system state and rewrites or inserts events.
- `midi_utils.ts` - `MIDIUtils`, analyzes and creates MIDI messages (RPN/NRPN, GS/XG/universal System Exclusives, resets).
- `analyzed_message.ts` - the types of the messages returned by the `MIDIUtils` analysis.
- `sysex_data.ts` - the GS/XG System Exclusive address maps and constants.
- `parameter_tracker.ts` - `ParameterTracker`, tracks the RPN/NRPN state of a channel.
- `apply_snapshot.ts` - applies the locked presets and controllers of a synthesizer snapshot to a MIDI file.
- `get_note_times.ts` - calculates the note times in seconds. Used by the web app's renderer to visualize them.
- `used_programs_and_keys.ts` - determines the presets and keys used by a MIDI file (`BasicMIDI.getUsedProgramsAndKeys`).
