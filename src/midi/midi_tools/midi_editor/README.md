## This is the MIDI editor folder.

The code here is responsible for `MIDIEditor`, the event-level editor behind `BasicMIDI.modify`.
It tracks the GS/XG/GM system state and rewrites or inserts events.

- `midi_editor.ts` - the class itself: its state, the main `apply()` loop and the event insertion and deletion helpers.
- `types.ts` - `ModifyMIDIOptions` and the other modification types, plus the internal channel and reset tracking.
- `handle_event.ts` - handles every event of the file (notes, program changes, SysEx, ...) and detects the resets.
- `controller_change.ts` - controller changes, Reset All Controllers, the channel parameter messages and the drum lock checks.
- `first_note_on.ts` - inserts the locked channel state before a channel's first note, tracks the XG drum setup.
- `reset.ts` - replaces or deletes the system resets and tracks them.
- `generate_setup.ts` - writes the full setup (parameters, effects, User Drum Sets) after a reset.

The methods in the other files are attached to the class with `.bind(this)`, like `MIDIChannel` does.
