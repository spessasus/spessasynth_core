# Creating MIDI files

SpessaSynth allows you to create MIDI files from scratch via `MIDIBuilder`

## Initialization

```ts
const mid = new MIDIBuilder(options);
```

All options are optional:

- `name` - `string` - the MIDI's name. The first event of the first track will be the track name with this. Defaults to `Untitled song`
- `timeDivision` - `number`, optional - the MIDI's time division. Defaults to 480.
- `initialTempo` - `number`, optional - the MIDI's initial tempo in beats per minute. Defaults to 120 BPM.
- `format` - `0|1` - the MIDI file track format. Format 0 allows only one track while format 1 allows more.

The file is initialized with one track.

This class inherits from `BasicMIDI` which means it can simply be passed to [writeMIDI](../writing-files/midi.md#writemidi)
or [SpessaSynthSequencer](../spessa-synth-sequencer/index.md).

## Methods

### flush

Updates the internal values of the file, making it ready for playback.

!!! Danger

    You MUST ALWAYS run this function after you finish creating the file!

```ts
mid.flush();
```

### addTrack

Adds a new MIDI track. Changes the format to 1.

```ts
mid.addTrack(name, (port = 0));
```

- `name` - `string` - The track's name. The first event will be track name with this.
- `port` - `number`, optional - the MIDI port to use. Leave it at 0, unless you know what you're doing.

### addEvent

Adds a new MIDI event.

```ts
mid.addEvent(ticks, track, event, eventData);
```

- `ticks` - `number` - the MIDI tick time of the event.
- `track` - `number` - the track to use.
- `event` - `number` - the [MIDI status byte](https://www.recordingblogs.com/wiki/status-byte-of-a-midi-message) of the
  message.
- `eventData` - `Uint8Array` or `number[]` - the message's binary data.

!!! Warning

    For meta messages, the `event` is the SECOND status byte, not the 0xFF!
    For system exclusives, the status byte is F0, and it must be excluded from `eventData`!

### setTempo

Adds a new "Set Tempo" meta message.

```ts
mid.setTempo(ticks, tempo);
```

- `ticks` - `number` - the MIDI tick time of the event.
- `tempo` - `number` - the new tempo in beats per minute.

### noteOn

Adds a new "Note On" message.

```ts
mid.noteOn(ticks, track, channel, midiNote, velocity);
```

- `ticks` - `number` - the MIDI tick time of the event.
- `track` - `number` - the track to use.
- `channel` - `number` - the MIDI channel to use. Ranges from 0 to 15.
- `midiNote` - `number` - the MIDI key number to press. Ranges from 0 to 127.
- `velocity` - `number` - the velocity (strength) of the keypress. Ranges from 0 to 127. A value of 0 is equal to "note
  off" message.

### noteOff

Adds a new "Note Off" message.

```ts
mid.noteOff(ticks, track, channel, midiNote);
```

- `ticks` - `number` - the MIDI tick time of the event.
- `track` - `number` - the track to use.
- `channel` - `number` - the MIDI channel to use. Ranges from 0 to 15.
- `midiNote` - `number` - the MIDI key number to release. Ranges from 0 to 127.

### programChange

Adds a new "Program Change" message.

```ts
mid.programChange(ticks, track, channel, programNumber);
```

- `ticks` - `number` - the MIDI tick time of the event.
- `track` - `number` - the track to use.
- `channel` - `number` - the MIDI channel to use. Ranges from 0 to 15.
- `programNumber` - `number` - the new MIDI program number to change.

### controllerChange

Adds a new "controller change" message.

```ts
mid.controllerChange(ticks, track, channel, controller, value);
```

- `ticks` - `number` - the MIDI tick time of the event.
- `track` - `number` - the track to use.
- `channel` - `number` - the MIDI channel to use. Ranges from 0 to 15.
- `controller` - `number` -
  the [MIDI Controller Number](../extra/midi-implementation.md#default-supported-controllers)
  to
  change.
- `value` - `number` - the new value of the controller. 0 to 127.

### pitchWheel

Adds a new "Pitch Wheel" message.

```ts
mid.pitchWheel(ticks, track, channel, pitch);
```

- `ticks` - `number` - the MIDI tick time of the event.
- `track` - `number` - the track to use.
- `channel` - `number` - the MIDI channel to use. Ranges from 0 to 15.
- `pitch` - `number` - the new 14-bit pitch value. Ranges from 0 to 16,383. Value of 8192 centers the wheel (no change)

### systemExclusive

Adds a new "System Exclusive" message.

```ts
mid.systemExclusive(ticks, track, data);
```

- `ticks` - `number` - the MIDI tick time of the event.
- `track` - `number` - the track to use.
- `data` - `number[]|TypedArray` - the System Exclusive data, without the 0xf0 status byte.

### registeredParameter

Selects a new "Registered Parameter Number".

```ts
mid.registeredParameter(ticks, track, channel, parameter, value);
```

- `ticks` - `number` - the MIDI tick time of the event.
- `track` - `number` - the track to use.
- `channel` - `number` - the MIDI channel to use. Ranges from 0 to 15.
- `parameter` - `number` - the 14-bit registered parameter number. For example 0 is pitch wheel range.
- `value` - `number` - the 14-bit value for this parameter.

### nonRegisteredParameter

Selects a new "Non-Registered Parameter Number".

```ts
mid.nonRegisteredParameter(ticks, track, channel, parameter, value);
```

- `ticks` - `number` - the MIDI tick time of the event.
- `track` - `number` - the track to use.
- `channel` - `number` - the MIDI channel to use. Ranges from 0 to 15.
- `parameter` - `number` - the 14-bit non-registered parameter number. For example 0 is pitch wheel range.
- `value` - `number` - the 14-bit value for this parameter.

## Example usage

The below code produces a file that plays C Major scale.

```ts
import { MIDIBuilder } from "spessasynth_core";
import fs from "fs/promises";

// Create a new MIDI file
const mid = new MIDIBuilder({
    name: "C Major Scale"
});

// Add the C Major scale notes
mid.noteOn(0, 0, 0, 60, 127);
mid.noteOff(1250, 0, 0, 60);
mid.noteOn(1250, 0, 0, 62, 127);
mid.noteOff(2500, 0, 0, 62);
mid.noteOn(2500, 0, 0, 64, 127);
mid.noteOff(3750, 0, 0, 64);
mid.noteOn(3750, 0, 0, 65, 127);
mid.noteOff(5000, 0, 0, 65);
mid.noteOn(5000, 0, 0, 67, 127);
mid.noteOff(6250, 0, 0, 67);
mid.noteOn(6250, 0, 0, 69, 127);
mid.noteOff(7500, 0, 0, 69);
mid.noteOn(7500, 0, 0, 71, 127);
mid.noteOff(8750, 0, 0, 71);
mid.noteOn(8750, 0, 0, 72, 127);
mid.noteOff(10000, 0, 0, 72);

// Finalize the MIDI file
mid.flush();

// Write the MIDI file
const file = mid.writeMIDI();
await fs.writeFile("c_major_scale.mid", new Uint8Array(file));
```
