# SpessaSynthProcessor

The core synthesis engine of SpessaSynth.

### Example

A good example of the processor in use can be
seen [spessasynth_lib's AudioWorklet wrapper](https://github.com/spessasus/spessasynth_lib/blob/master/src/synthetizer/worklet_processor.js).

## Initialization

```ts
const synth = new SpessaSynthProcessor(sampleRate, options);
```

- sampleRate - number - sample rate in Hertz, like 44,100Hz.
- options, an object, explained below

### Managers

- [Key Modifier Manager](key-modifier-manager.md)
- [Sound Bank Manager](sound-bank-manager.md)

### options

#### enableEventSystem

Boolean, if the event system is enabled. Default is `true`.

#### initialTime

Number, initial internal synth time in seconds.
Useful when synchronizing the processor with the audio thread time.
Default is 0.

#### effectsEnabled

Boolean, if the effects are enabled.
Disabling means that effect outputs will be filled with zeroes.
Defaults to `true`.

#### midiChannels

Number, the default number of MIDI channels.
Defaults to 16.

## MasterParameterTypes

TODO

## Methods

### renderAudio

Render float32 audio data to the stereo outputs.

```ts
synth.renderAudio(outputs, reverb, chorus, startIndex = 0, sampleCount = all);
```

- outputs - an array of exactly two `Float32Array` - the left and right audio output buffer, respectively.
- reverb - an array of exactly two `Float32Array` - the left and right audio buffer for the reverb processor.
- chorus - an array of exactly two `Float32Array` - the left and right audio buffer for the chorus processor.
- startIndex - optional, `number` - the offset at which to start rendering audio in the provided arrays. Default is 0.
- sampleCount - optional, `number` - the number of samples to render. Default is the entire length, starting from
  `startIndex`.

All `Float32Array`s must be the same length.

!!! Caution

    This method renders a single quantum of audio.
    The LFOs and envelopes are only processed at the beginning.
    The sampleCount/audio buffer should not be longer than 256 samples.

!!! Tip

    If `effetctsEnabled` is set to false, the effect arrays passed can be empty (`[]`).

### renderAudioSplit

Render float32 audio data of separate channels at once.

```ts
synth.renderAudioSplit(reverbChannels, chorusChannels, separateChannels, startIndex = 0, sampleCount = all);
```

- reverbChannels - an array of exactly two `Float32Array` - the left and right audio buffer for the reverb processor.
- chorusChannels - an array of exactly two `Float32Array` - the left and right audio buffer for the chorus processor.
- separateChannels - an array of exactly 16 pairs of `Float32Array` - one pair represents one channel,
  for example, the first pair is first channels L and R outputs and so on.
- startIndex - optional, `number` - the offset at which to start rendering audio in the provided arrays. Default is 0.
- sampleCount - optional, `number` - the number of samples to render. Default is the entire length, starting from
  `startIndex`.

All `Float32Array`s must be the same length.

!!! Caution

    This method renders a single quantum of audio.
    The LFOs and envelopes are only processed at the beginning.
    The sampleCount/audio buffer should not be longer than 256 samples.

!!! Tip

    If `effectsEnabled` is set to false, the effect arrays passed can be empty (`[]`).

### destroySynthProcessor

Delete all internal values and free up the memory.

### createMidiChannel

Create a new MIDI channel.

### processMessage

Send a raw MIDI message to the synthesizer. Calls noteOn, noteOff, etc. internally.

```ts
synth.processMessage(message, channelOffset = 0, force, eventOptions);
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

Play the given note.

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

Stop the given note.

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
synth.pitchWheel(channel, MSB, LSB);
```

- channel - the MIDI channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- MSB and LSB. 7-bit numbers that form a 14-bit pitch bend value calculated as: `(MSB << 7) | LSB`

!!! Tip

    [I highly recommend this article for more info.](https://www.recordingblogs.com/wiki/midi-pitch-wheel-message)

### systemExclusive

Handle a MIDI System Exclusive message.

```ts
synth.systemExclusive(messageData, channelOffset = 0);
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
synth.controllerChange(channel, controllerNumber, controllerValue, force = false);
```

- channel - the MIDI channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- controllerNumber - the MIDI CC number of the controller to change.
  Refer
  to [this table](https://github.com/spessasus/spessasynth_core/wiki/MIDI-Implementation#default-supported-controllers)
  for the list of controllers
  supported by default.
- controllerValue - the value to set the given controller to. Ranges from 0 to 127.
- force - boolean, if true, overrides locked controllers.

!!! Note

    Note that theoretically all controllers are supported as it depends on the SoundFont's modulators.

### resetAllControllers

Reset all controllers to their default values and all programs. Essentially a system reset

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
synth.stopAllChannels(force = false);
```

- force - if true, the voices will be cut instead of releasing smoothly

### setSystem

Set a MIDI bank select system.

```ts
synth.setSystem(system);
```

- system - `gs`, `gm2`, `gm` or `xg` - refer
  to [MIDI implementation](../extra/midi-implementation.md#supported-bank-systems)
  for
  more info.

## Properties

### onEventCall

A listener for events.

Parameters:

- eventType - string - the event type.
- eventData - depends - the event data.

[Refer to the synth event types for all events.](event-types.md)

### onChannelPropertyChange

A listener for channel property changes.

Parameters:

- newProperty - ChannelProperty - the new property.
- channelNumber - number - the channel number that the property belongs to.

The property is formatted as follows:

```ts
/**
 * @typedef {Object} ChannelProperty
 * @property {number} voicesAmount - the channel's current voice amount
 * @property {number} pitchBend - the channel's current pitch bend from -8192 do 8192
 * @property {number} pitchBendRangeSemitones - the pitch bend's range, in semitones
 * @property {boolean} isMuted - indicates whether the channel is muted
 * @property {boolean} isDrum - indicates whether the channel is a drum channel
 * @property {number} transposition - the channel's transposition, in semitones
 * @property {number} bank - the bank number of the current preset
 * @property {number} program - the MIDI program number of the current preset
 */
```

### onMasterParameterChange

A listerer for change in master parameters.

Parameters:

- parameter - masterParameterType - the new parameter type.
- value - the new value.