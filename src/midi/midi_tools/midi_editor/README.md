## This is the MIDI editor folder.

The code here is responsible for `MIDIEditor`, the event-level editor behind `BasicMIDI.modify`.
It tracks the GS/XG/GM system state and rewrites or inserts events.

- `midi_editor.ts` - the class itself: parses the options, builds the edit context and runs the steps of `apply()`.
- `edit_options.ts` - parses the modify options once (channel changes, cleared channels, requested effects, the GM replacement).
- `channel_status.ts` - creates the tracked state of each channel, plus the N/RPN selection records a reset starts with.
- `missing_reset.ts` - adds a reset at the start when the setup needs one and the file has none that will be kept.
- `types.ts` - `ModifyMIDIOptions` and the other modification types, plus the internal channel and reset tracking and the edit context.
- `event_cursor.ts` - `EventCursor`, the position in `BasicMIDI.iterate` with the inserts and deletes around the current event.
- `delete_event.ts` - deletes the current event, or the whole N/RPN parameter when the event is its data entry.
- `handle_event.ts` - handles every event of the file (notes, program changes, controllers, ...) and passes SysEx on.
- `sysex.ts` - handles system exclusive messages: the locked ones, resets, SysEx program changes and bulk dumps.
- `controller_change.ts` - controller changes, Reset All Controllers, the channel parameter messages and the inserted N/RPN selection.
- `locks.ts` - checks if the options lock a drum or User Drum Set parameter.
- `first_note_on.ts` - inserts the locked channel state before a channel's first note, tracks the XG drum setup.
- `reset.ts` - replaces or deletes the system resets and tracks them.
- `generate_setup.ts` - writes the full setup (parameters, effects, User Drum Sets) after a reset.

The handlers are plain functions. They get the edit context (`EditContext`: the cursor, the parsed options, the channel states, the resets and the current system)
or only the parts they need, and call each other directly.
