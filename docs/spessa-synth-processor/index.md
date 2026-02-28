# SpessaSynthProcessor

The core synthesis engine of SpessaSynth.
This module converts sound bank and MIDI data into PCM audio data.
The internal synthesis system is modeled after SoundFont2 synthesis model.

## Example

A good example of the processor in use can be
seen [spessasynth_lib's AudioWorklet wrapper](https://github.com/spessasus/spessasynth_lib/blob/master/src/synthetizer/worklet_processor.js).

## Initialization

```ts
const synth = new SpessaSynthProcessor(sampleRate, options);
```

- sampleRate - number - sample rate in Hertz, for example 44,100Hz.
- options - optional configuration, explained below:

```ts
interface SynthProcessorOptions {
    /**
     * Indicates if the event system is enabled. This can be changed later.
     */
    enableEventSystem: boolean;
    /**
     * The initial time of the synth, in seconds.
     */
    initialTime: number;
    /**
     * Indicates if the effects are enabled. This can be changed later.
     */
    enableEffects: boolean;
}
```

## Managers

- [Key Modifier Manager](key-modifier-manager.md)
- [Sound Bank Manager](sound-bank-manager.md)

## Methods

### renderAudio

Render PCM float32 audio data to the stereo outputs.

```ts
synth.renderAudio(
    outputs,
    reverb,
    chorus,
    (startIndex = 0),
    (sampleCount = all)
);
```

- outputs - an array of exactly two `Float32Array` - the left and right audio output buffer, respectively.
- reverb - an array of exactly two `Float32Array` - the left and right audio buffer for the reverb processor.
- chorus - an array of exactly two `Float32Array` - the left and right audio buffer for the chorus processor.
- startIndex - optional, `number` - the offset at which to start rendering audio in the provided arrays. Default is 0.
- sampleCount - optional, `number` - the number of samples to render. Default is the entire length, starting from
  `startIndex`.

**All `Float32Array`s must be the same length**

!!! Danger

    This method renders a single quantum of audio.
    The LFOs and envelopes are only processed at the beginning.
    `sampleCount` should be 128 samples or less.
    Larger values may cause memory allocation and incorrect playback!

!!! Tip

    If `enableEffects` is set to false, the effect arrays passed can be empty (`[]`).

### renderAudioSplit

Render PCM float32 audio data of separate channels + effects.

```ts
synth.renderAudioSplit(
    reverbChannels,
    chorusChannels,
    separateChannels,
    (startIndex = 0),
    (sampleCount = all)
);
```

- reverbChannels - an array of exactly two `Float32Array` - the left and right audio buffer for the reverb processor.
- chorusChannels - an array of exactly two `Float32Array` - the left and right audio buffer for the chorus processor.
- separateChannels - an array of `Float32Array` pairs - one pair represents one channel (`[L, R]`),
  for example, the first pair is first channels L and R outputs and so on. If there are fewer arrays than the channels, the extra channels will render into the same arrays.
- startIndex - optional, `number` - the offset at which to start rendering audio in the provided arrays. Default is 0.
- sampleCount - optional, `number` - the number of samples to render. Default is the entire length, starting from
  `startIndex`.

**All `Float32Array`s must be the same length**

!!! Danger

    This method renders a single quantum of audio.
    The LFOs and envelopes are only processed at the beginning.
    `sampleCount` should be 128 samples or less.
    Larger values may cause memory allocation and incorrect playback!

!!! Tip

    If `enableEffects` is set to false, the effect arrays passed can be empty (`[]`).

### destroySynthProcessor

Delete all internal values and free up the memory.

### createMIDIChannel

Create a new MIDI channel.

### processMessage

Send a raw MIDI message to the synthesizer. Calls noteOn, noteOff, etc. internally.

```ts
synth.processMessage(message, (channelOffset = 0), force, eventOptions);
```

- message - `Uint8Array` - The MIDI message to process.
- channelOffset - number, optional - adds to the channel number of the message. It defaults to 0.
- force - boolean - forces the message. That is:
    - kills a note instead of releasing it
    - force sets a controller
- eventOptions - an object, currently defined properties are:
    - time - number - time in seconds for when the message is executed.
      This allows message scheduling.
      Absolute time in synth's current time.
      A value less than the current time causes the message to get executed immediately.

### noteOn

Start playing note.

```ts
synth.noteOn(channel, midiNote, velocity);
```

- channel - the MIDI channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- midiNote - the note to play. Ranges from 0 to 127.
- velocity - controls how loud the note is.
  Note that velocity of 0 has
  the same effect as using `noteOff`.
  Ranges from 0 to 127, where 127 is the loudest and 1 is the quietest.

### noteOff

Stop playing a note.

```ts
synth.noteOff(channel, midiNote);
```

- channel - the MIDI channel to use. It Usually ranges from 0 to 15, but it depends on the channel count.
- midiNote - the note to play. Ranges from 0 to 127.

### programChange

Change the preset for the given channel.

```ts
synth.programChange(channel, programNumber);
```

- channel - the MIDI channel to change. It usually ranges from 0 to 15, but it depends on the channel count.
- programNumber - the MIDI program number to use.
  Ranges from 0 to 127.
  To use other banks, go
  to [controllerChange](#controllerchange).

### pitchWheel

Change the channel's pitch, including the currently playing notes.

```ts
synth.pitchWheel(channel, pitch, (midiNote = -1));
```

- channel - the MIDI channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- pitch - the 14-bit MIDI pitch value to use (0 - 16,383)
- midiNote, optional - allows to set per-note pitch wheel, which will activate the per-note pitch mode. Leave unset or set to -1 for a regular pitch wheel.

### systemExclusive

Handle a MIDI System Exclusive message.

```ts
synth.systemExclusive(messageData, (channelOffset = 0));
```

- messageData - Uint8Array, the message byte data **Excluding the 0xF0 byte!**
- channelOffset - number, the channel offset for the message as they usually can only address the first 16 channels.
  For example, to send a system exclusive on channel 16,
  send a system exclusive for channel 0 and specify the channel offset to be 16.

!!! Tip

    Refer to
    [MIDI Implementation](../extra/midi-implementation.md) for the list of supported System Exclusives.

### controllerChange

Set a given MIDI controller to a given value.

```ts
synth.controllerChange(channel, controllerNumber, controllerValue);
```

- channel - the MIDI channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- controllerNumber - the MIDI CC number of the controller to change.
  Refer
  to [this table](../extra/midi-implementation.md#default-supported-controllers)
  for the list of controllers
  supported by default.
- controllerValue - the value to set the given controller to. Ranges from 0 to 127.

!!! Note

    Note that theoretically all controllers are supported as it depends on the SoundFont's modulators.

### resetAllControllers

Reset all controllers and all programs to their default values. Essentially a system reset.
This will reset all controllers to their default values,
except for the locked controllers.

```ts
synth.resetAllControllers();
```

### channelPressure

Apply pressure to the given channel. It usually controls the vibrato amount.

```ts
synth.channelPressure(channel, pressure);
```

- channel - the channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- pressure - the pressure to apply. Ranges from 0 to 127.

### polyPressure

Apply pressure to the given note on a given channel. It usually controls the vibrato amount.

```ts
synth.polyPressure(channel, midiNote, pressure);
```

- channel - the channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- midiNote - the note to apply pressure to. Ranges from 0 to 127.
- pressure - the pressure to apply. Ranges from 0 to 127.

### stopAllChannels

Stop all voices on all channels.

```ts
synth.stopAllChannels((force = false));
```

- force - if true, the voices will be cut instead of releasing smoothly.

### setMasterParameter

Set a [master parameter value.](master-parameter.md)

```ts
synth.setMasterParameter(type, value);
```

- type - the type of the parameter to set, a string of the parameter type.
- value - the value of the parameter to set, depends on the type.

### getMasterParameter

Get a [master parameter value.](master-parameter.md)

```ts
synth.getMasterParameter(type);
```

- type - the type of the master parameter to get, a string of the parameter type.

Returns the value of the master parameter.

### getAllMasterParameters

Get all master parameters of the synthesizer.

This returns all the master parameters as a type: value object.

### killVoices

!!! WARNING

    This method is deprecated and does nothing! Voice killing is done automatically.

### applySynthesizerSnapshot

Apply a [SynthesizerSnapshot](synthesizer-snapshot.md) to this synthesizer.

```ts
synth.applySynthesizerSnapshot(snapshot);
```

- snapshot - the snapshot to apply.

### getSnapshot

Get a [SynthesizerSnapshot](synthesizer-snapshot.md) instance of this synthesizer.

### setEmbeddedSoundBank

Set the embedded sound bank to this synthesizer.

This method shouldn't generally be used as it is only used by the sequencer.
Use the sound bank manager directly.

### clearEmbeddedSoundbank

Remove the embedded sound bank from the synthesizer.

### clearCache

Clear the synthesizer's voice cache.

## Properties

### onEventCall

This property can be defined as a function that listens for events.

Parameters the function gets called with:

- eventType - SynthProcessorEventData - the event type.
- eventData - depends - the event data.

[Refer to the synth event types for all events.](event-types.md)

### midiChannels

All MIDI channels of the synthesizer, an array of `MIDIChannel`.

### soundBankManager

The [sound bank manager](sound-bank-manager.md) of this synthesizer.

### keyModifierManager

The [key modifier manager](key-modifier-manager.md) of this synthesizer.

### onMissingPreset

A handler for missing presets during program change. By default, it warns to console.
It may be useful for allowing the synthesizer to work without any sound banks.

Parameters the function gets called with:

- patch - `MIDIPatch` - the MIDI patch that was requested.
- system - `SynthSystem` (`gs`, `xg`, `gm` or `gm2`) - the MIDI System for the request.

If a `BasicPreset` instance is returned by the function, it will be used by the channel.

### totalVoicesAmount

The current total amount of voices that are currently playing, a number.

### processorInitialized

A `Promise` that must be awaited before the processor is used with a compressed sound bank.

### currentSynthTime

The current time of the synthesizer, in seconds.

!!! Warning

    You should not modify this.

### sampleRate

The sample rate in Hertz.

### enableEffects

Enable or disable the effect channels.

### enableEventSystem

Enable or disable the event system.
Setting this to `false` will cause the synthesizer to not emit any `onEventCall` callbacks.
