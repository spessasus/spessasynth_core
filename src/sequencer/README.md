## This is the sequencer's folder.

The code here is responsible for playing back the parsed MIDI sequence with the synthesizer.

- `sequencer_engine.js` - the core sequencer engine
- `play.js` - handles playback control and timing
- `song_control.js` - manages song state and control
- `process_event.js` - processes MIDI events during playback
- `process_tick.js` - processes a single MIDI tick (think of it like a rendering quantum of the sequencer)
