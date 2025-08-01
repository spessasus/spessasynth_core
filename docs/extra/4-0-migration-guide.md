# 4.0 Migration guide

SpessaSynth 4.0 (The TypeScript Update) updates its libraries to ship with TypeScript definitions.

It also includes a few breaking changes which were made to make the API more consistent and logical.

This page documents all the breaking changes in spessasynth_core.

!!! Note

    Please report any innacurate or missing changes.

## Breaking changes

All variables with `soundfont` in them have been renamed to use `soundBank` instead.
This is done because spessasynth can load sound bank formats other than SoundFonts as well.

## MIDI

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
 - `RMIDInfo` -> `rmidiInfo`
 - `MIDITicksToSeconds()` -> `midiTicksToSeconds()`
 - `midiPortChannelOffsets` -> `portChannelOffsetMap`

#### midiName

Renamed to `name`.

If no name is found. It will no longer fall back to `fileName` but be empty instead.

To replicate the old behavior, consider `mid.name || mid.fileName`.

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

Renamed to `rawName` and will now be undefined if a name is not found.

### midiNameUsesFileName

Removed. You can compare `name === fileName` or check if `rawName` is undefined.

## Enums

### messageTypes

Enum renamed to `midiMessageTypes`.

### RMIDINFOChunks

Enum renamed to `rmidInfoChunks`.

## MIDI (Class)

Removed, replaced by `BasicMIDI.fromArrayBuffer()`.
Drop-in replacement.

## Sound bank

### loadSoundFont

Removed, replaced by `SoundBankLoader.fromArrayBuffer()`.
Drop-in replacement.

### Modulator

`modulatorDestination` has been renamed to `destination`.

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

A few methods and properties have been renamed for consistency.
They behave in exactly the same way.

- `presetZones` -> `zones`
- `presetName` -> `name`
- `deletePreset()` -> `delete()`

Preset zones now _require_ an instrument.
This means that
`createZone()` now requires one argument: the instrument that belongs to that zone.

### BasicSoundBank

A few methods and properties have been renamed for consistency.
They behave in exactly the same way.

- `soundFontInfo` -> `soundBankInfo`
- `getDummySoundfontFile()` -> `getSampleSoundBankFile()`

## SpessaSynthProcessor

A few methods and properties have been renamed for consistency.
They behave in exactly the same way.

- `soundfontManager` -> `soundBankManager`
- `midiAudioChannels` -> `midiChannels`
- `createMidiChannel()` -> `createMIDIChannel()`

### Events

`onMasterParameterChange` has been replaced with an event `masterParameterChange`.
`onChannelPropertyChange` has been replaced with an event `channelPropertyChange`.

`onEventCall` now takes a single object as an argument. This is done to help with TypeScript type narrowing in switch statements.

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

#### reloadManager

Removed. `addSoundBank` can be used to replace an existing one.
`reloadManager` could cause issues with embedded sound banks.

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