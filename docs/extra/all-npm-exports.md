# NPM Exports

This is a (non-exhaustive) list of exports in the NPM package.

!!! Tip

    I suggest using enums from this library (if they fit your needs) instead of coding in raw numbers in your program
    as this ensures that if something gets updated, your program won't break.

## Synthesizer and Sequencer

- `SpessaSynthProcessor` - the main synthesis engine.
- `SpessaSynthSequencer` - the main sequencer engine.
- `SynthesizerSnapshot` - the class for manipulating synthesizer snapshots.
- `ChannelSnapshot` - a part of SynthesizerSnapshot, represents a single channel.
- `KeyModifier` - for the `KeyModifierManager`.

### Related Enums

- `InterpolationTypes` - the available interpolation types.
- `DEFAULT_PERCUSSION` - the default drum channel, i.e. channel 9.
- `VOICE_CAP` - the default voice cap of the synthesizer. Currently, 350.
- `DEFAULT_SYNTH_MODE` - the default synthesizer sysEx and bank select mode. Currently, `gs`.
- `SPESSASYNTH_GAIN_FACTOR` - this factor adjusts the volume of the synthesizer permanently. It can be nullified via the `gain` global system parameter.
- `SPESSA_BUFSIZE` - the default buffer size. Currently, 128.
- `DEFAULT_CHANNEL_SYSTEM_PARAMETERS` - default values for channel system parameters.
- `DEFAULT_GLOBAL_SYSTEM_PARAMETERS` - default values for global system parameters.
- `DEFAULT_CHANNEL_MIDI_PARAMETERS` - default values for channel MIDI parameters.
- `DEFAULT_GLOBAL_MIDI_PARAMETERS` - default values for global MIDI parameters.

## Sound banks

- `SoundBankLoader` - the loader for SF2 or DLS files.
- `BasicSoundBank` - represents a sound bank file. (be it DLS or SF2)
- `BasicSample` - represents a sample. (be it DLS or SF2)
- `EmptySample` - a class that simplifies the process of creating a new sample.
- `BasicZone` - represents a generic zone (only generators, modulators and ranges).
- `BasicInstrumentZone` - represents an instrument zone in a sound bank. Extends BasicZone with a `sample` property.
- `BasicInstrument` - represents an instrument (layer two) in a sound bank.
- `BasicPreset` - represents a preset (top layer) in a sound bank.
- `BasicPresetZone` - represents a preset zone in a sound bank. Extends BasicZone with a `instrument` property.
- `Generator` - represents an SF2 generator.
- `Modulator` - represents an SF2 modulator.

### Related Enums

- `ModulatorControllerSources` - an enum for modulator sources as defined in SF2 specification.
- `ModulatorCurveTypes` - an enum for modulator curve types as defined in the SF2 specification.
- `GeneratorTypes` - an enum for all the generators in the SF2 specification, along with a few internal ones.
- `GeneratorLimits` - an object, the key specifies the type, the value is min, max and def (default) values for this
  generator.
- `SampleTypes` - all `sfSampleType`s defined in the SF2 specification.
- `GENERATORS_AMOUNT` - the number of generators the library can store.

## MIDI

- `BasicMIDI` - the base class for MIDI sequences.
- `MIDIBuilder` - the MIDI file builder.
- `MIDIMessage` - represents a single MIDI/meta/sysEx event.

### Related enums

- `MIDIControllers` - an enum for all MIDI controllers.
- `MIDIMessageTypes` - an enum for all the MIDI event status bytes recognized.
- `CONTROLLER_TABLE_SIZE` - the amount of MIDI controllers, i.e., 128.
- `DEFAULT_MIDI_CONTROLLERS` - an array containing 14-bit default MIDI controller values.

### Others

- `IndexedByteArray` - an Uint8Array with an internal counter called `currentIndex`. Extensively used in the library.
- `audioToWav` - a function that converts PCM audio data to a WAV file.
- `SpessaLog` - the log manager for `spessasynth_core`.
- `SpessaSynthCoreUtils` - some utilities and byte functions of the library, used by `spessasynth_lib` and might be useful
  for your project too!
