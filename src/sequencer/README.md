## This is the sequencer's folder.

The code here is responsible for playing back the parsed MIDI sequence with the synthesizer.

- `sequencer.ts` - the core sequencer engine.
- `set_time_to.ts` - handles fast seek.
- `load_new_sequence.ts` - loads a new sequence into the sequencer.
- `process_event.ts` - processes MIDI events during playback.
- `process_tick.ts` - processes a single MIDI tick (think of it like a rendering quantum of the sequencer).
