# 4.0 Migration guide

SpessaSynth 4.0 (The TypeScript Update) updates its libraries to ship with TypeScript definitions.

It also includes a few breaking changes which were made to make the API more consistent and logical.

This page documents all the breaking changes in spessasynth_core.

!!! Note

    Please report any innacurate or missing changes.

## Breaking changes

All variables with `soundfont` in them have been renamed to use `soundBank` instead.
This is done because spessasynth can load sound bank formats other than SoundFonts as well.

## MIDI Patch System

SpessaSynth 4.0 brings the full bank LSB support in the API.

The system now operates on _MIDI Patches_ - a way of selecting MIDI presets using 4 properties,
 compatible with GM, GS, XG and GM2. 
 The existing MIDI files will continue to work as the preset selection system has been fine-tuned for various types of MIDI files.

The properties are explained below.

### program

The MIDI program number, from 0 to 127.

### bankLSB

Bank LSB controller, 0 to 127. This is mostly used in XG and GM2 for selecting variations of instruments, much like MSB in GS.

Note that the SF2 format does not support writing the bank LSB number so the `wBank` is still interpreted as both and flattened when writing.

### bankMSB

This is what the previous `bank` used to be, but it's now properly split up.

It is used for sound variation in GS, and for channel type in XG and GM2. 
This means that with bank MSB of 127 for example, a channel in XG mode will turn into a drum channel.

### isGMGSDrum

This flag is exclusive to GM and GS systems. These don't use bank MSB as a drum flag. 
GM has channel 9 hardcoded as drums, and GS has a system exclusive for setting them.
This allows XG and GS drums to coexist in a single sound bank and can be thought of as bank 128 in SF2.

## MIDI


### MIDI (Class)

Removed, replaced by `BasicMIDI.fromArrayBuffer()`.
Drop-in replacement.

### MIDISequenceData

Removed, BasicMIDI now contains all data.

### MIDIMessage


A few properties have been renamed for consistency.
They behave in exactly the same way.

- `messageStatusByte` -> `statusByte`
- `messageData` -> `data`

### BasicMIDI

A few methods and properties have been renamed for consistency.
They behave in exactly the same way.


 - `embeddedSoundFont` -> `embeddedSoundBank`
 - `MIDITicksToSeconds()` -> `midiTicksToSeconds()`
 - `modifyMIDI()` -> `modify()`
 - `midiPortChannelOffsets` -> `portChannelOffsetMap`
 - `applySnapshotToMIDI()` -> `applySnapshot()`

####  RMIDInfo

Renamed to `rmidiInfo`.

Like `soundBankInfo`, the object's property names are no longer the fourCCs, but human-readable names.

However, they still are stored as `Uint8Array`s due to possibly unknown encodings.

Use `getRMIDInfo` or `setRMIDInfo` to get the decoded JS objects.

#### writeRMIDI

Now takes a partial `options` object instead of separate optional arguments.

Now returns `ArrayBuffer` instead of `Uint8Array`.

#### writeMIDI

Now returns `ArrayBuffer` instead of `Uint8Array`.

#### midiName

Removed.

It was only decoded via `fromCharCode` (due to the requirement of AudioWorkletGlobalScope which does not have the TextDecoder),
so it often resulted in broken names.

`getName()` solves this issue and provides all the needed fallbacks (rawName, RMIDInfo and fileName). It's a direct replacement.

#### copyright

Removed in favor of `extraMetadata`. There isn't a consistent way to determine a copyright of a MIDI file as it's often stored in track names or markers.
Extra metadata separates what copyright was: a stitched string of all meta events that were "interesting".

Like with midiName, `getExtraMetadata()` decodes the text.

#### tracks

Is no longer an array of `MIDIMessage`, but its own class: `MIDITrack`.
The property `events` contains the events of the track.

#### trackNames

Removed, replaced with `MIDITrack.name`.

#### lyrics

Now contains `MIDIMessage` list instead of Uint8Array. Note that karaoke sanitization is no longer performed.

#### midiPorts

Removed, replaced with `MIDITrack.port`

#### usedChannelsOnTracks

Removed, replaced with `MIDITrack.channels`.

#### rawMidiName

Renamed to `binaryName` and will now be undefined if a name is not found.
It is also protected. Use `getName` instead, which handles everything for you.

#### midiNameUsesFileName

Removed. You can compare `getName() === fileName`.

### MIDIBuilder

Now takes an optional `options` object instead of separate option arguments.
It also enforces correct MIDI formats 0 and 1.

## Enums

### messageTypes

Enum renamed to `midiMessageTypes`.

### RMIDINFOChunks

Enum removed due to the `rmidInfo` object being reworked.


### interpolationTypes

- `fourthOrder` -> `hermite`


### synthDisplayTypes

Removed. The `synthdisplay` now provides the entire message data.


## BasicSoundBank

A few methods and properties have been renamed for consistency.
They behave in exactly the same way.

- `getDummySoundfontFile()` -> `getSampleSoundBankFile()`
- `write()` -> `writeSF2()`

### soundBankInfo

Renamed from `soundFontInfo` to `soundBankInfo`.

Overhaul: now mandatory fields are always required and naming has been changed from the confusing FourCCs to human-readable names such as `name` or `engineer`.

`ifil` and `iver` are no longer strings. They are objects `version` and `romVersion` respectively. The objects contain `major` and `minor` version numbers instead of a stitched together `<major>.<minor>` string.

Creation date is now a `Date`.

### loadSoundFont

Removed, replaced by `SoundBankLoader.fromArrayBuffer()`.
Drop-in replacement.

### Modulator

`modulatorDestination` has been renamed to `destination`.

All properties regarding source have been replaced with a class `ModulatorSource`, which can automatically turn itself into an SF2 enum or transform values.

The static method `copy` has been made local. So `Modulator.copy(mod)` turns into `mod.copy()`

### BasicSample

A few properties have been renamed for consistency.
They behave in exactly the same way.

- `sampleName` -> `name`
- `samplePitch` -> `originalKey`
- `samplePitchCorrection` -> `samplePitchCorrection`
- `sampleLoopStartIndex` -> `loopStart`
- `sampleLoopEndIndex` -> `loopEnd`

`sampleData` property is now protected.
It was never meant to be accessed directly, `getAudioData` should be used instead.

`setAudioData` now requires two parameters instead of one: sample data and sample rate.

### CreatedSample

`CreatedSample` has been removed and replaced in favor of `EmptySample`. The constructor takes no arguments.

### BasicInstrument

A few methods and properties have been renamed for consistency.
They behave in exactly the same way.

- `instrumentZones` -> `zones`
- `instrumentName` -> `name`
- `deleteInstrument()` -> `delete()`

### BasicInstrumentZone

- `setSample` -> `sample` (setter)

Instrument zones now _require_ a sample.
This means that
`createZone()` now requires one argument: the sample that belongs to that zone.

### BasicPreset

#### bank

replaced with the MIDI patch system. For `BasicPreset` this means splitting up into three properties:

- bankLSB
- bankMSB
- isGMGSDrum

A few methods and properties have been renamed for consistency.
They behave in exactly the same way.

- `presetZones` -> `zones`
- `presetName` -> `name`
- `deletePreset()` -> `delete()`

Preset zones now _require_ an instrument.
This means that
`createZone()` now requires one argument: the instrument that belongs to that zone.

## SpessaSynthProcessor

A few methods and properties have been renamed for consistency.

- `soundfontManager` -> `soundBankManager`
- `midiAudioChannels` -> `midiChannels`
- `createMidiChannel()` -> `createMIDIChannel()`

The option `effectsEnabled` has been renamed to `enableEffects`.

### pitchWheel

Now takes a single `pitch` 14-bit value instead of the confusing `MSB` and `LSB` parameters. Same with the `pitchWheel` event.

### Events

`onMasterParameterChange` has been replaced with an event `masterParameterChange`.
`onChannelPropertyChange` has been replaced with an event `channelPropertyChange`.

`onEventCall` now takes a single object as an argument. This is done to help with TypeScript type narrowing in switch statements.

The event names have been capitalized with camelCase. So, for example `noteon` becomes `noteOn`.

`allControllerReset` event no longer calls CC changes to default values. This was never intended as they are redundant when this controller exists.
The default reset values can be accessed via the `defaultMIDIControllerValues` export. Locked controllers still get restored.

`stopAll` now specifies a channel number.

### Master parameters


The master parameter system has been overhauled to use strings instead of enums.

```ts
processor.setMasterParameter(masterParameterType.masterPan, 1);
```
changes into:
```ts
processor.setMasterParameter("masterPan", 1);
```

`setSystem` has been replaced with a master parameter.

A few properties have been replaced with master parameters.

- `deviceID`
- `interpolationType`
- `highPerformanceMode` - note: renamed to `blackMIDIMode`
- `transposition`
- `mainVolume` - note: renamed to `masterGain`
- `reverbGain`
- `chorusGain`
- `voiceCap`
- `pan`
- `system`
- `_monophonicRetriggerMode`

### Sound Bank Manager

A few methods and properties have been renamed for consistency.
They behave in exactly the same way.

- `soundfontList` -> `soundBankList`
- `deleteSoundFont` -> `deleteSoundBank`
- `addNewSoundFont` -> `addSoundBank`
- `destroyManager` -> `destroy`
- `getCurrentSoundFontOrder` -> `priorityOrder` (getter)
- `rearrangeSoundFonts` -> `priorityOrder` (setter)
- `getPresetList` -> `presetList` (getter)

#### presetList

`presetName` -> `name`

#### reloadManager

Removed. `addSoundBank` can be used to replace an existing one.
`reloadManager` could cause issues with embedded sound banks.

### channel configuration

Removed. It only had one property (velocity override) which can be implemented via key modifiers.

### Synthesizer Snapshot

The following properties have been replaced by a property `masterParameters`:

- `mainVolume`
- `pan`
- `interpolation`
- `system`
- `transposition`

#### static applySnapshot()

Removed, replaced by non-static `apply()`.
Drop-in replacement.

#### static createSynthesizerSnapshot()

Removed, replaced by static `create()`
Drop-in replacement.

## SpessaSynthSequencer

The behavior has been overhauled:

The `preservePlaybackState` has been removed and is always on.
Loading a new song list no longer automatically starts the playback.

### loop

Removed, `loopCount` of zero disables the loop.


### previousSong, nextSong

Removed, replaced with setting the `songIndex` property.

### onEvent...

All `onSomething` have been replaced with `onEventCall` to bring the API in-line with `SpessaSynthProcessor`.

Note that this method also only takes a single object to help with TypeScript type narrowing.

## SpessaSynthLogging

The parameter `table` has been removed as the `console.table` command is not used.

## AudioToWav

Now takes an `options` object instead of separate optional parameters.