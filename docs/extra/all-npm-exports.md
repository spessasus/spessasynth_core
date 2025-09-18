# NPN Exports

This is a (non-exhaustive) list of exports in the NPM package.

!!! Tip

    I suggest using enums from this library (if they fit your needs) instead of coding in raw numbers in your program
    as this ensures that if something gets updated, your program won't break.

## Synthesizer and Sequencer

- SpessaSynthProcessor - the main synthesis engine.
- SpessaSynthSequencer - the main sequencer engine.
- SynthesizerSnapshot - the class for manipulating synthesizer snapshots.
- ChannelSnapshot - a part of SynthesizerSnapshot, represents a single channel.
- KeyModifier - for the key Modifier manager.

### Related Enums

- masterParameterType - for setting master parameters.
- interpolationTypes - the available interpolation types.
- ChannelSnapshot - a subclass of SynthesizerSnapshot, a snapshot of a single MIDI channel in the thread.
- DEFAULT_PERCUSSION - the default drum channel, i.e. channel 9.
- VOICE_CAP - the default voice cap of the synthesizer. Currently, 350.
- NON_CC_INDEX_OFFSET - the offset for other modulator sources for controller locking, i.e., 128.
- ALL_CHANNELS_OR_DIFFERENT_ACTION - the number that does a different action for a synthesizer function when put in
  the "channel" argument, i.e., -1.
- DEFAULT_SYNTH_MODE - the default synthesizer sysEx and bank select mode, i.e., `gs`
- MIDI_CHANNEL_COUNT - the default MIDI channel amount, i.e., 16.

## Sound banks

- SoundBankLoader - the loader for SF2 or DLS files.
- BasicSoundBank - represents a sound bank file. (be it DLS or SF2)
- BasicSample - represents a sample. (be it DLS or SF2)
- CreatedSample - a class that simplifies the process of creating a new sample.
- BasicZone - represents a generic zone (only generators, modulators and ranges).
- BasicGlobalZone - represents a global zone. Extends BasicZone but doesn't add properties.
- BasicInstrumentZone - represents an instrument zone in a sound bank. Extends BasicZone with a `sample` property.
- BasicInstrument - represents an instrument (layer two) in a sound bank.
- BasicPreset - represents a preset (top layer) in a sound bank.
- BasicPresetZone - represents a preset zone in a sound bank. Extends BasicZone with a `instrument` property.
- Generator - represents an SF2 generator.
- Modulator - represents an SF2 modulator.

### Related Enums

- modulatorSources - an enum for modulator sources as defined in SF2 specification.
- modulatorCurveTypes - an enum for modulator curve types as defined in the SF2 specification.
- generatorTypes - an enum for all the generators in the SF2 specification, along with a few internal ones.
- generatorLimits - an object, the key specifies the type, the value is min, max and def (default) values for this
  generator.
- sampleTypes - all `sfSampleType`s defined in the SF2 specification.
- dlsSources - an enum for DLS sources as defined in the DLS level 2 specification.
- dlsDestinations - an enum for DLS destinations as defined in the DLS level 2 specification.

## MIDI

- BasicMIDI - the base class for MIDI sequences.
- MIDIBuilder - the MIDI file builder.
- MIDIMessage - represents a single MIDI/meta/sysEx event.
- rmidInfoChunks - an enum for RMIDI info chunk data.

### Related enums

- rmidInfoChunks - all the default RMIDI info chunk codes.
- midiControllers - an enum for all MIDI controllers.
- midiMessageTypes - an enum for all the MIDI event status bytes recognized.

### Others

- IndexedByteArray - an Uint8Array with an internal counter called `currentIndex`. Extensively used in the library.
- audioToWav - a function that converts PCM audio data to a WAV file.
- SpessaSynthLogging - a function to control log output of the library.
- SpessaSynthCoreUtils - some utilities and byte functions of the library, used by `spessasynth_lib` and might be useful
  for your project too!