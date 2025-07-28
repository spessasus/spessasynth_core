# MIDI Class
This is the module responsible for parsing MIDI files.

> [!TIP]
> If you encounter any errors in this documentation, please **open an issue!**

## Table of Contents
<!-- TOC -->
* [MIDI Class](#midi-class)
  * [Table of Contents](#table-of-contents)
  * [Initialization](#initialization)
  * [Properties](#properties)
    * [tracksAmount](#tracksamount)
    * [trackNames](#tracknames)
    * [timeDivision](#timedivision)
    * [midiName](#midiname)
    * [fileName](#filename)
    * [midiNameUsesFileName](#midinameusesfilename)
    * [rawMidiName](#rawmidiname)
    * [copyright](#copyright)
    * [tempoChanges](#tempochanges)
    * [loop](#loop)
    * [format](#format)
    * [firstNoteOn](#firstnoteon)
    * [lastVoiceEventTick](#lastvoiceeventtick)
    * [duration](#duration)
    * [midiPorts](#midiports)
    * [midiPortChannelOffsets](#midiportchanneloffsets)
    * [usedChannelsOnTrack](#usedchannelsontrack)
    * [keyRange](#keyrange)
    * [lyrics](#lyrics)
    * [RMID Related](#rmid-related)
      * [embeddedSoundFont](#embeddedsoundfont)
      * [bankOffset](#bankoffset)
      * [RMIDInfo](#rmidinfo)
    * [tracks](#tracks)
  * [Methods](#methods)
    * [flush](#flush)
    * [MIDIticksToSeconds](#miditickstoseconds)
    * [writeMIDI](#writemidi)
    * [writeRMIDI](#writermidi)
    * [modifyMIDI](#modifymidi)
    * [applySnapshotToMIDI](#applysnapshottomidi)
    * [getUsedProgramsAndKeys](#getusedprogramsandkeys)
    * [getNoteTimes](#getnotetimes)
  * [How the file is stored](#how-the-file-is-stored)
<!-- TOC -->

> [!TIP]
> Using the npm package? Make sure you've read [this](Npm-Size-Reduction)

## Initialization
```js
const parsedMIDI = new MIDI(arrayBuffer);
```
- arrayBuffer - an `arrayBuffer` anstance of the midi file.

## Properties
### tracksAmount
The number of tracks in the file.
```js
console.log(`this file has ${parsedMIDI.tracksAmount}`);
```

### trackNames
The track names of the MIDI file. If a track doesn't have a name, it will have an empty string.
```js
console.log(`First track is called ${parsedMIDI.trackNames[0]}`);
```

### timeDivision
The time division of the midi file. MIDI ticks per quarter note.
```js
console.log(`this sequence's time division is ${parsedMIDI.timeDivision}`);
```

### midiName
The sequence's name. The first track's `Track Name`'s event text.
```js
console.log(`This sequence is named "${parsedMIDI.midiName}"`);
```

> [!TIP]
> This property uses basic decoding. If the name is encoded in a different encoding, like shift_jis, it might be better to use rawMidiName.

### fileName
The name of the MIDI file if provided during the initialization.

### midiNameUsesFileName
A `boolean` indicating if the MIDI name is the same as file name, therefore there's no need to decode it.

### rawMidiName
The sequence's name, as a raw `Uint8Array`. Useful for handling unusual encodings.
```js
console.log(new TextDecoder("shift-jis").decode(parsedMIDI.rawMidiName)); // ダメなりんご！！
```

### copyright
The decoded copyright and description of the file.
Individual messages are separated with a newline. Note: this not only includes the copyright events, but also others.
Treat this like "additional information" about the file.
```js
console.log(`Midi file description: ${parsedMIDI.copyright}`);
```

### tempoChanges
Ordered from last to first, all the tempo changes in the file. 
It will always contain at least one tempo change (the default 120BPM at zero ticks).
```js
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

### loop
The points of the loop detected in the MIDI file in ticks. 
If there's nothing detected, the loop will start from the first note on event and end will be the last note off.
Current looping detection is: CC 2/4, 116/117 and "start," "loopStart" and "loopEnd" markers.
```js
console.log(parsedMIDI.loop); // {start: 1294, end: 49573}
```

### format
The [MIDI file format.](https://www.music.mcgill.ca/~ich/classes/mumt306/StandardMIDIfileformat.html#BM2_2) Usually 0 or 1, rarely 2.
```js
console.log(parsedMIDI.format); // 1
```

### firstNoteOn
The MIDI tick number of the first noteOn event in the sequence. It can be used to skip the initial silence.
```js
console.log(parsedMIDI.firstNoteOn); // 1294
```

### lastVoiceEventTick
The MIDI tick number of the last voice event in the sequence.
Treated as the last event in the sequence, even if the end of track is later.

```js
console.log(parsedMIDI.lastVoiceEventTick); // 14518
```

### duration
The sequence's duration in seconds.
```js
console.log(parsedMIDI.duration); // 125.64;
```

> [!IMPORTANT]
> The MIDI file's duration is the start of the file to `midi.lastVoiceEventTick`.
> To alter the end time, 
> add a controller change (preferably an unused CC, like CC#50) at the time you want the file to end,
> then run `midi.flush()`

### midiPorts
The detected midi ports for each track. Each port represents a batch of 16 channels.
```js
console.log(parsedMIDI.midiPorts); // [0, 0, 0, 1, 1, 2, ...]
```

### midiPortChannelOffsets
The channel offsets for each MIDI port, using the [SpessaSynth method](About-Multi-Port#spessasynth-implementation)
```js
console.log(parsedMIDI.midiPortChannelOffsets); // [16, 0, 48, 32, ...]
```

### usedChannelsOnTrack
All the channels that each track refers to. An array of `Set`s.
```js
console.log(parsedMIDI.usedChannelsOnTrack) // [ Set[0, 1, 2, 3, 4] ] - this sequence has 1 track which plays on channels 0, 1, 2, 3 and 4
```

### keyRange
The key range of the sequence. The lowest pressed key and highest.
```js
console.log(parsedMIDI.keyRange); // {min: 0, max: 127}
```

### lyrics
The detected lyrics, stored as binary text data, as MIDIs can use different encodings.
Stored as an array of `Uint8Array`s, each is a single lyrics event.

### RMID Related

> [!TIP]
> See [SF2 RMIDI Extension Specification](https://github.com/spessasus/sf2-rmidi-specification#readme) for more info.

#### embeddedSoundFont
An `ArrayBuffer` representation of the embedded soundfont in an RMID file. If no soundfont or not RMID, undefined.
This can be either SoundFont binary or DLS binary.

> [!WARNING]
> If the embedded soundfont is defined, `Sequencer` will automatically pass it to the synthesizer.
> If you want to avoid this behavior, make sure you set it to undefined before passing the rmid file.

#### bankOffset
A `number` representing the bank offset of the file. Only applies to RMID, for normal MIDIs it's set to 0.

#### RMIDInfo
An `Object` representing the INFO chunk of an RMID file. [See this for more information](https://github.com/spessasus/sf2-rmidi-specification#info-chunk).

### tracks
The actual MIDI sequence data. Described below.

## Methods
### flush
Updates internal values. Call this after editing the contents of `midi.tracks`.

```js
midi.flush();
```

> [!CAUTION]
> Not calling `flush` after making significant changes to the track may result in unexpected behavior.

### MIDIticksToSeconds
Calculates time in seconds given the MIDI ticks.

```js
midi.MIDIticksToSeconds(ticks);
```

- ticks - `number` - the time in MIDI ticks.

The returned value is the time in seconds from the start of the MIDI to the given tick. 

### writeMIDI
Renders the sequence as a .mid-file.
See [Writing MIDI files](Writing-MIDI-Files#writemidi) for more info.

```js
midi.writeMIDI();
```

The returned value is an `Uint8Array` - a binary representation of the .mid-file.


### writeRMIDI
This function writes out an RMIDI file (MIDI + SF2).
[See more info about this format](https://github.com/spessasus/sf2-rmidi-specification#readme)
```js
const rmidiBinary = midi.writeRMIDI(
    soundfontBinary,
    soundfont, 
    bankOffset = 0, 
    encoding = "Shift_JIS", 
    metadata = {},
    correctBankOffset = true
);
```
- See [Writing MIDI files](Writing-MIDI-Files#writermidi) for more info.

### modifyMIDI
A function for modifying MIDI files.
See [Writing MIDI files](Writing-MIDI-Files#modifymidi) for more info.


### applySnapshotToMIDI
A function for applying a [Synthesizer snapshot](Synthesizer-Snapshot) to a MIDI file.
See [Writing MIDI files](Writing-MIDI-Files) for more info.

### getUsedProgramsAndKeys
Goes through the MIDI file and returns all used program numbers and MIDI key:velocity combinations for them,
 for a given sound bank (used for capital tone fallback).

```js
const used = midi.getUsedProgramsAndKeys(soundfont);
```

- soundfont - `BasicSoundBank` - an instance of the parsed soundbank to "play" the MIDI with.

The returned value is `Object<string, Set<string>>`. That is:
- The key is a string representing a given preset that was used as `bank:program`, e.g., `8:16` (bank 8, program 16)
- The value is a `Set` of all unique combinations played on this preset, formatted as `key-velocity`, e.g., `60:120` (key 60, velocity 120)

### getNoteTimes
Returns nicely formatted note data for easy sequence visualization.

```js
const data = midi.getNoteTimes(minDrumLength = 0);
```
- minDrumLength - number, defaults to 0 - a number, in seconds, representing the minimum allowed time for a drum note, since they sometimes have a length of 0.

The returned value is an array of 16 arrays. Each of these represents one of the 16 MIDI channels.

Each channel is a list of notes, represented as objects with properties:
- midiNote - number - the MIDI key number
- velocity - number - the MIDI velocity
- start - number - the absolute note start time in seconds
- length - number - the note length in seconds

Example:

```js
const data = [
    [{midiNote: 60, velocity: 100, start: 0.5, length: 0.25}], // channel 1
    // other 14 channels...
    [{midiNote: 36, velocity: 96, start: 41.54, length: 0.1}]  // channel 16
];
```

## How the file is stored
The file is stored as an array of tracks, accesible via `parsedMIDI.tracks`.
Each track is an array of events. 
Each event is a `MIDIMessage` class, which is defined as follows;
```js
class MIDIMessage
{
  /**
   * absolute amount of MIDI Ticks from the start of the track
   * @type {number}
   */
  ticks;

  /**
   * the status byte of the message as a number from 0 to 255
   * @type {number}
   */
  messageStatusByte;

  /**
   * @type {IndexedByteArray}
   */
  messageData;
}
```
- ticks - absolute amount of MIDI Ticks from the start of the track.
- messageStatusByte - the status byte of the message as a number from 0 to 255. [Learn more here](https://www.recordingblogs.com/wiki/status-byte-of-a-midi-message) [and here](https://www.recordingblogs.com/wiki/midi-meta-messages).

> [!IMPORTANT]
> Note that for Meta Events, the status byte is the SECOND status byte, not the 0xFF!

- messageData - a `IndexedByteArray`(Pretty much exactly the same as `Uint8Array`) instance of the event's binary data.

> [!CAUTION]
> Not calling `flush` after making significant changes to the track data may result in unexpected behavior.