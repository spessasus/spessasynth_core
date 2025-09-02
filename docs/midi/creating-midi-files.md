# Creating MIDI files

SpessaSynth allows you to create MIDI files from scratch via `MIDIBuilder`

## Initialization

```ts
const mid = new MIDIBuilder(name, timeDivision = 480, initialTempo = 120);
```

- `name` - `string` - the MIDI's name. The first event of the first track will be the track name with this.
- `timeDivision` - `number`, optional - the MIDI's time division. Defaults to 480.
- `initialTempo` - `number`, optional - the MIDI's initial tempo in beats per minute. Defaults to 120 BPM.

The file is initialized with one track.

This class inherits from `MIDI` which means it can simply be passed to [writeMIDI](../writing-files/midi.md#writemidi)
or [SpessaSynthSequencer](../spessa-synth-sequencer/index.md).

## Methods

### flush

Updates the internal values of the file, making it ready for playback.

!!! Caution

    You MUST ALWAYS run this function after you finish creating the file!

```ts
mid.flush();
```

### addNewTrack

Adds a new MIDI track. Changes the format to 1.

```ts
mid.addNewTrack(name, port = 0);
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

!!! Caution

    For meta messages, the `event` is the SECOND status byte, not the 0xFF!
    For system exclusives, the status byte is F0, and it must be excluded from `eventData`!

### addSetTempo

Adds a new "set tempo" message.

```ts
mid.addSetTempo(ticks, tempo);
```

- `ticks` - `number` - the MIDI tick time of the event.
- `tempo` - `number` - the new tempo in beats per minute.

### addNoteOn

Adds a new "note on" message.

```ts
mid.addNoteOn(ticks, track, channel, midiNote, velocity);
```

- `ticks` - `number` - the MIDI tick time of the event.
- `track` - `number` - the track to use.
- `channel` - `number` - the MIDI channel to use. Ranges from 0 to 15.
- `midiNote` - `number` - the MIDI key number to press. Ranges from 0 to 127.
- `velocity` - `number` - the velocity (strength) of the keypress. Ranges from 0 to 127. A value of 0 is equal to "note
  off" message.

### addNoteOff

Adds a new "note off" message.

```ts
mid.addNoteOff(ticks, track, channel, midiNote);
```

- `ticks` - `number` - the MIDI tick time of the event.
- `track` - `number` - the track to use.
- `channel` - `number` - the MIDI channel to use. Ranges from 0 to 15.
- `midiNote` - `number` - the MIDI key number to release. Ranges from 0 to 127.

### addProgramChange

Adds a new "program change" message.

```ts
mid.addProgramChange(ticks, track, channel, programNumber)
```

- `ticks` - `number` - the MIDI tick time of the event.
- `track` - `number` - the track to use.
- `channel` - `number` - the MIDI channel to use. Ranges from 0 to 15.
- `programNumber` - `number` - the new MIDI program number to change.

### addControllerChange

Adds a new "controller change" message.

```ts
mid.addControllerChange(ticks, track, channel, controllerNumber, controllerValue);
```

- `ticks` - `number` - the MIDI tick time of the event.
- `track` - `number` - the track to use.
- `channel` - `number` - the MIDI channel to use. Ranges from 0 to 15.
- `controllerNumber` - `number` -
  the [MIDI Controller Number](../extra/midi-implementation.md#default-supported-controllers)
  to
  change.
- `controllerValue` - `number` - the new value of the controller. 0 to 127.

### addPitchWheel

Adds a new "pitch wheel" message.

```ts
mid.addPitchWheel(ticks, track, channel, MSB, LSB);
```

- `ticks` - `number` - the MIDI tick time of the event.
- `track` - `number` - the track to use.
- `channel` - `number` - the MIDI channel to use. Ranges from 0 to 15.
- `MSB` and `LSB` - both `number` - 7-bit numbers that form a 14-bit pitch bend value.

!!! Tip

    [I highly recommend this article for more info.](https://www.recordingblogs.com/wiki/midi-pitch-wheel-message)

## Example usage

The below code produces a file that plays C Major scale.

```ts
// Create a new MIDI file
const mid = new MIDIBuilder("C Major Scale", 480, 240);

// Add the C Major scale notes
mid.addNoteOn(0, 0, 0, 60, 127);
mid.addNoteOff(1250, 0, 0, 60);
mid.addNoteOn(1250, 0, 0, 62, 127);
mid.addNoteOff(2500, 0, 0, 62);
mid.addNoteOn(2500, 0, 0, 64, 127);
mid.addNoteOff(3750, 0, 0, 64);
mid.addNoteOn(3750, 0, 0, 65, 127);
mid.addNoteOff(5000, 0, 0, 65);
mid.addNoteOn(5000, 0, 0, 67, 127);
mid.addNoteOff(6250, 0, 0, 67);
mid.addNoteOn(6250, 0, 0, 69, 127);
mid.addNoteOff(7500, 0, 0, 69);
mid.addNoteOn(7500, 0, 0, 71, 127);
mid.addNoteOff(8750, 0, 0, 71);
mid.addNoteOn(8750, 0, 0, 72, 127);
mid.addNoteOff(10000, 0, 0, 72);

// Finalize the MIDI file
mid.flush();

// Write the MIDI file to a blob and save it
const b = mid.writeMIDI();
const blob = new Blob([b.buffer], {type: "audio/mid"});
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = "C_major_scale.mid";
a.click();
```