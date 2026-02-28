# BasicMIDI

BasicMIDI parser and represents a single MIDI sequence.

!!! Tip

    If you encounter any errors in this documentation, please **open an issue!**

## Initialization

```ts
const parsedMIDI = BasicMIDI.fromArrayBuffer(arrayBuffer, (altName = ""));
```

- arrayBuffer - an `arrayBuffer` instance of the MIDI file.
- altName - the _optional_ name of the file, will be used if the MIDI file does not have a name.

## Properties

### tracks

The tracks in the sequence, represented as an array of [MIDI tracks](midi-track.md)

### timeDivision

The time division of the midi file. MIDI ticks per quarter note.
Essentially the resolution of the file.

### duration

The sequence's duration in seconds.

!!! Note

    The MIDI file's duration is the start of the file to `midi.lastVoiceEventTick`.
    To alter the end time,
    add a controller change (preferably an unused CC, like CC#50) at the time you want the file to end,
    then run `midi.flush()`

### tempoChanges

Ordered from last to first, all the tempo changes in the file.
It will always contain at least one tempo change (the default 120BPM at zero ticks).

```ts
[
    {
        tempo: 140 /* tempo in BPM */,
        ticks: 5437 /* absolute amount of MIDI Ticks from the start */
    },

    /*...*/

    {
        // the default tempo change
        tempo: 120,
        ticks: 0
    }
];
```

### extraMetadata

Any extra metadata found in the file.
These messages were deemed "interesting" by the parsing algorithm and can be displayed by the MIDI player as some form of metadata.

An array of [MIDI messages](midi-message.md).

### lyrics

An array containing the lyrics of the sequence.

An array of [MIDI messages](midi-message.md).

### firstNoteOn

The tick position of the first note-on event in the MIDI sequence.

### keyRange

The maximum key range of the sequence.

An object:

- min - the lowest MIDI note number in the sequence.
- max - the highest MIDI note number in the sequence.

### lastVoiceEventTick

The MIDI tick number of the last voice event in the sequence.
Treated as the last event in the sequence, _even if the end of track is later._

!!! Note

    To alter the end time,
    add a controller change (preferably an unused CC, like CC#50) at the time you want the file to end,
    then run `midi.flush()`

### portChannelOffsetMap

The channel offsets for each MIDI port, using
the [SpessaSynth method](../extra/about-multi-port.md#spessasynth-implementation)

The index is the port number and the value is the channel offset.

### loop

The points of the loop detected in the MIDI file in ticks.
If there's nothing detected, the loop will start from the first note on event and end will be the last voice message.
Current looping detection is: CC 2/4, 116/117 and "start," "loopStart" and "loopEnd" markers.

#### start

The start of the loop, in MIDI ticks.

#### end

The end of the loop, in MIDI ticks.

#### type

The type of the loop detected:

- `soft` - the playback will immediately jump to the loop start pointer without any further processing.
- `hard` - the playback will quickly process all messages from
  the start of the file to ensure that synthesizer is in the correct state.
  This is the default behavior.

Soft loop types are enabled by default for Touhou and GameMaker loop points.

### fileName

The name of the MIDI file if provided during the initialization.

String or undefined.

### format

The [MIDI file format.](https://www.music.mcgill.ca/~ich/classes/mumt306/StandardMIDIfileformat.html#BM2_2) Usually 0 or
1, rarely 2.

### rmidiInfo

The RMID (Resource-Interchangeable MIDI) info data, if the file is RMID formatted.
Otherwise, this object is empty.
Info type: Chunk data as a binary array.
Note that text chunks contain a terminal zero byte.

!!! Note

    See [SF2 RMIDI Extension Specification](https://github.com/spessasus/sf2-rmidi-specification#readme) for more info.

### bankOffset

A `number` representing the bank offset of the file. Only applies to RMID, for normal MIDIs it's set to 0.

### isKaraokeFile

If the MIDI file is a Soft Karaoke file (.kar), this is set to true.
https://www.mixagesoftware.com/en/midikit/help/HTML/karaoke_formats.html

### isDLSRMIDI

If the MIDI file is a DLS RMIDI file.

### embeddedSoundBank

An `ArrayBuffer` the binary representation of the embedded sound bank in an RMID file.
This will be undefined in songs that do not have it.

!!! WARNING

    If the embedded sound bank is defined, `Sequencer` will automatically pass it to the synthesizer.
    If you want to avoid this behavior, make sure you set it to undefined before passing the BasicMIDI.

### infoEncoding

The encoding of the RMIDI info in file (for example `Shift_JIS` or `utf-8`), if specified. Otherwise undefined

## Methods

### fromArrayBuffer

Loads a MIDI file (SMF, RMIDI, XMF) from a given ArrayBuffer.

```ts
BasicMIDI.fromArrayBuffer(arrayBuffer, (filename = ""));
```

- arrayBuffer - the ArrayBuffer containing the binary file data.
- fileName - the optional name of the file, will be used if the MIDI file does not have a name.

!!! Note

    This method is *static.*

### fromFile

Loads a MIDI file (SMF, RMIDI, XMF) from a given file.

```ts
BasicMIDI.fromFile(file);
```

- file - the `File` object to load.

!!! Note

    This method is *static.*

### copyFrom

Copies the sequence (deep copy).

```ts
BasicMIDI.copyFrom(mid);
```

- mid - The BasicMIDI to copy.

!!! Note

    This method is *static.*

### midiTicksToSeconds

Calculates time in seconds given the MIDI ticks.

```ts
midi.midiTicksToSeconds(ticks);
```

- ticks - `number` - the time in MIDI ticks.

The returned value is the time in seconds from the start of the MIDI to the given tick.

### secondsToMIDITicks

Calculates time in MIDI ticks given seconds.

```ts
midi.secondsToMIDITicks(seconds);
```

- seconds - `number` - the time in seconds.

The returned value is the time in MIDI ticks from the start of the MIDI to the given second.
Note that the returned value will always be rounded to the nearest integer.

### getUsedProgramsAndKeys

Goes through the MIDI file and returns all used program numbers and MIDI key:velocity combinations for them,
for a given sound bank (used for capital tone fallback).

```ts
const used = midi.getUsedProgramsAndKeys(soundBank);
```

- soundBank - `BasicSoundBank` - an instance of the parsed sound bank to "play" the MIDI with.

The returned value is `Map<BasicPreset, Set<string>>`. That is:

- The key is a `BasicPreset`, the patch that was used by the song.
- The value is a `Set` of all unique combinations played on this preset, formatted as `key-velocity`, e.g., `60-120` (
  key 60, velocity 120)

### preloadSynth

Preloads a given `SpessaSynthProcessor` instance.
This caches all the needed voices for playing back this sequencer, resulting in a smooth playback.
The sequencer calls this function by default when loading the songs. ([it can be disabled](../spessa-synth-sequencer/index.md#preload)).

```ts
midi.preloadSynth(synth);
```

- synth - a `SpessaSynthProcessor` instance to preload.

### flush

Updates all parameters. Call this after editing the contents of `midi.tracks` (the events).

This updates parameters like `firstNoteOn`, `lastVoiceEventTick` or `loop`.

```ts
midi.flush();
```

!!! Warning

    Not calling `flush` after making significant changes to the track may result in unexpected behavior.

### getNoteTimes

Returns nicely formatted note data for easy sequence visualization.

```ts
const data = midi.getNoteTimes((minDrumLength = 0));
```

- minDrumLength - number, defaults to 0 - a number, in seconds, representing the minimum allowed time for a drum note,
  since they sometimes have a length of 0.

The returned value is an array of 16 arrays. Each of these represents one of the 16 MIDI channels.

Each channel is a list of notes, represented as objects with properties:

- midiNote - number - the MIDI key number,
- velocity - number - the MIDI velocity,
- start - number - start of the note, in seconds.
- length - number - length of the note, in seconds.

Example:

```ts
const data = [
    [{ midiNote: 60, velocity: 100, start: 0.5, length: 0.25 }], // channel 1
    // other 14 channels...
    [{ midiNote: 36, velocity: 96, start: 41.54, length: 0.1 }] // channel 16
];
```

### writeMIDI

Renders the sequence as a Standard MIDI File (.mid)
See [Writing MIDI files](../writing-files/midi.md#writemidi) for more info.

```ts
midi.writeMIDI();
```

The returned value is an `ArrayBuffer` - a binary representation of the file.

### writeRMIDI

This function writes out an RMIDI file (MIDI + SF2).
[See more info about this format](https://github.com/spessasus/sf2-rmidi-specification#readme)

```ts
const rmidiBinary = midi.writeRMIDI(soundBankBinary, configuration);
```

- See [Writing MIDI files](../writing-files/midi.md#writermidi) for more info.

The returned value is an `ArrayBuffer` - a binary representation of the file.

### modify

A function for modifying MIDI files.
See [Writing MIDI files](../writing-files/midi.md#modify) for more info.

### applySnapshot

A function for applying a [Synthesizer snapshot](../spessa-synth-processor/synthesizer-snapshot.md) to a MIDI file.
See [Writing MIDI files](../writing-files/midi.md) for more info.

### getName

Gets the MIDI's decoded name.

```ts
midi.getName((encoding = "Shift_JIS"));
```

- encoding - The encoding to use if the MIDI uses an extended code page.

Note that RMIDI encoding overrides the provided encoding.

The returned value is a string - the name of the song or the file name if it's not specified. Otherwise, empty.

### getExtraMetadata

Gets the decoded extra metadata as text and removes any unneeded characters (such as "@T" for karaoke files).

```ts
midi.getExtraMetadata((encoding = "Shift_JIS"));
```

- encoding - The encoding to use if the MIDI uses an extended code page.

Note that RMIDI encoding overrides the provided encoding.

The returned value is an array of strings - each `extraMetadata` decoded and sanitized.

### setRMIDInfo

Sets a given RMIDI info value.

```ts
midi.setRMIDInfo(infoType, infoData);
```

- infoType - the type to set.
- infoData - the value to set it to.

!!! Note

    This sets the info encoding to utf-8.

### getRMIDInfo

Gets a given chunk from the RMIDI information, undefined if it does not exist.

```ts
midi.getRMIDInfo(infoType);
```

- infoType - the type to get.

Returns string, Date, ArrayBuffer or undefined.

### iterate

Iterates over the MIDI file, ordered by the time the events happen.

```ts
midi.iterate(callback);
```

- callback - a custom defined callback function for each event. The parameters are as follows:
    - event - the `MIDIMessage`.
    - trackNumber - the track number of this event.
    - eventIndexes - the current event indexes for each track. If your function deletes or adds new events, make sure to update the indexes accordingly!
