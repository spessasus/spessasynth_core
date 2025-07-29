# 3.28 Migration guide

SpessaSynth 3.28 (The TypeScript Update) updates its libraries to ship with TypeScript definitions.

It also includes a few breaking changes which were made to make the API more consistent and logical.

This page documents all the breaking changes in spessasynth_core.

!!! Note

    Please report any innacurate or missing changes.

## Breaking changes

All variables with `soundfont` in them have been renamed to use `soundBank` instead.

## MIDI

### BasicMIDI

`embeddedSoundFont` has been renamed to `embeddedSoundBank`

### messageTypes

Enum renamed to `midiMessageTypes`.

### MIDI (Class)

Deprecated, replaced by `BasicMIDI.fromArrayBuffer()`.
Drop-in replacement.

## Sound bank

### loadSoundFont

Deprecated, replaced by `SoundBankLoader.fromArrayBuffer()`.
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

`onMasterParameterChange` has been replaced with an event `masterParameterChange`.
`onChannelPropertyChange` has been replaced with an event `channelPropertyChange`.

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

### Master parameters

The master parameter system has been overhauled to use strings instead of enums.

```ts
processor.setMasterParameter(masterParameterType.masterPan, 1);
```
changes into:
```ts
processor.setMasterParameter("masterPan", 1);
```

### Sound Bank Manager

A few methods and properties have been renamed for consistency.
They behave in exactly the same way.

- `soundfontList` -> `soundBankList`
- `deleteSoundFont` -> `deleteSoundBank`
- `addNewSoundFont` -> `addNewSoundBank`
- `getCurrentSoundFontOrder` -> `getSoundBankOrder`
- `rearrangeSoundFonts` -> `setSoundBankOrder`

### Synthesizer Snapshot

The following properties have been replaced by a property `masterParameters`:

- `mainVolume`
- `pan`
- `interpolation`
- `system`
- `transposition`

#### static applySnapshot()

Deprecated, replaced by non-static `apply()`.
Drop-in replacement.

### static createSynthesizerSnapshot()

Deprecated, replaced by static `create()`
Drop-in replacement.
