# SpessaSynthProcessor

The core synthesis engine of SpessaSynth.
This module converts sound bank and MIDI data into PCM audio data.
The internal synthesis system is modeled after SoundFont2 synthesis model.

## Initialization

```ts
const synth = new SpessaSynthProcessor(sampleRate, options);
```

- sampleRate - number - sample rate in Hertz, for example 44,100Hz.
- options - optional configuration, explained below:

### Synth processor options

- maxBufferSize - `number` - The maximum buffer size the synthesizer can render at once.
  Attempting to `.process()` more samples than this will result in an error. Defaults to 128.
- enable event system - `boolean` - Indicates if the event system is enabled. This can be changed later.
- initialTime - `number` - The initial time of the synth, in seconds.
- enableEffects - `boolean` - Indicates if the effects are enabled. This can be changed later.
- reverbProcessor - `ReverbProcessor` - Reverb processor for the synthesizer. Leave undefined to use the default.
- chorusProcessor - `ChorusProcessor` - Chorus processor for the synthesizer. Leave undefined to use the default.
- delayProcessor - `DelayProcessor` - Delay processor for the synthesizer. Leave undefined to use the default.

All properties are optional. If they are not supplied, the defaults will be used.

## Effects

- [Reverb](reverb-processor.md) - How to implement your own reverb processor.
- [Chorus](chorus-processor.md) - How to implement your own chorus processor.
- [Delay](delay-processor.md) - How to implement your own delay processor.

## Managers

- [Key Modifier Manager](key-modifier-manager.md)
- [Sound Bank Manager](sound-bank-manager.md)

## Methods

### process

Render PCM float32 audio data to the stereo outputs and processes the effects if they are enabled.

```ts
synth.process(left, right, (startIndex = 0), (sampleCount = all));
```

- left - a `Float32Array` - the left audio output buffer.
- right - a `Float32Array` - the right audio output buffer.
- startIndex - optional, `number` - the offset at which to start rendering audio in the provided arrays. Default is 0.
- sampleCount - optional, `number` - the number of samples to render. Default is the entire length, starting from
  `startIndex`.

**All `Float32Array`s must be the same length**

!!! Danger

    This method renders a single quantum of audio.
    The LFOs and envelopes are only processed at the beginning.
    `sampleCount` cannot exceed `maxBufferSize`. Larger values will throw an exception!

### processSplit

Render PCM float32 audio data of separate channels + effects.

```ts
synth.processSplit(
    outputs,
    effectsLeft,
    effectsRight,
    (startIndex = 0),
    (sampleCount = all)
);
```

- separateChannels - an array of `Float32Array` pairs - one pair represents one channel (`[L, R]`),
  for example, the first pair is first channels L and R outputs and so on. If there are fewer arrays than the channels,
  the extra channels will render into the same arrays.
- effectsLeft - a `Float32Array`- the left output buffer for effects.
- effectsRight - a `Float32Array` - the right output buffer for effects.
- startIndex - optional, `number` - the offset at which to start rendering audio in the provided arrays. Default is 0.
- sampleCount - optional, `number` - the number of samples to render. Default is the entire length, starting from
  `startIndex`.

**All `Float32Array`s must be the same length**

!!! Danger

    This method renders a single quantum of audio.
    The LFOs and envelopes are only processed at the beginning.
    `sampleCount` cannot exceed `maxBufferSize`. Larger values will throw an exception!

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

    Refer to the
    [MIDI Implementation](../extra/midi-implementation.md#system-exclusives)
    for the list of supported System Exclusives.

### controllerChange

Set a given MIDI controller to a given value.

```ts
synth.controllerChange(channel, controller, value);
```

- channel - the MIDI channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- controller - the MIDI CC number of the controller to change.
  Refer
  to [this table](../extra/midi-implementation.md#default-supported-controllers)
  for the list of controllers
  supported by default.
- value - the value to set the given controller to. Ranges from 0 to 127.

!!! Tip

    See the [MIDI Implementation](../extra/midi-implementation.md#default-supported-controllers) for more details.

### noteOn

Executes a MIDI Note On message on the specified channel.
Starts playing a note.

```ts
synth.noteOn(channel, midiNote, velocity);
```

- channel - the MIDI channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- midiNote - the note to play. Ranges from 0 to 127.
- velocity - controls how loud the note is. Ranges from 0 to 127, where 127 is the loudest and 1 is the quietest.

!!! Note

    Velocity of 0 has the same effect as using `noteOff`.

### noteOff

Executes a MIDI Note Off message on the specified channel.
Stops playing a note.

```ts
synth.noteOff(channel, midiNote);
```

- channel - the MIDI channel to use. It Usually ranges from 0 to 15, but it depends on the channel count.
- midiNote - the note to play. Ranges from 0 to 127.

### polyPressure

Executes a MIDI Poly Pressure (Aftertouch) message on the specified channel.
This differs from the Channel Pressure in that it's per-note and not for the whole channel.

```ts
synth.polyPressure(channel, midiNote, pressure);
```

- channel - the channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- midiNote - the note to apply pressure to. Ranges from 0 to 127.
- pressure - the pressure to apply. Ranges from 0 to 127.

### channelPressure

Executes a MIDI Channel Pressure (Aftertouch) message on the specified channel.

```ts
synth.channelPressure(channel, pressure);
```

- channel - the channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- pressure - the pressure to apply. Ranges from 0 to 127.

### pitchWheel

Executes a MIDI Pitch Wheel message on the specified channel.

```ts
synth.pitchWheel(channel, pitch, (midiNote = -1));
```

- channel - the MIDI channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- pitch - the 14-bit MIDI pitch value to use (0 - 16,383)
- midiNote, optional - allows to set per-note pitch wheel,
  which will activate the per-note pitch mode.
  Leave unset or set to -1 for a regular pitch wheel.

### programChange

Executes a MIDI Program Change message on the specified channel.

```ts
synth.programChange(channel, programNumber);
```

- channel - the MIDI channel to change. It usually ranges from 0 to 15, but it depends on the channel count.
- programNumber - the MIDI program number to use.
  Ranges from 0 to 127.
  To use other banks, go
  to [controllerChange](#controllerchange).

### processMessage

Processes a raw MIDI message and allows scheduling it at a specific time.

```ts
synth.processMessage(message, (channnelOffset = 0), (options = null));
```

- message - `number` or any byte Typed Array (like `Uint8Array`) - the MIDI message to process.
- channelOffset - `number`, optional - adds to the channel number of the message. It defaults to 0.
- eventOptions - an `object`, currently defined properties are:
    - time - `number` - time in seconds for when the message is executed.
      This allows message scheduling.
      Absolute time in synth's current time.
      A value less than the current time causes the message to get executed immediately.

### setSystemParameter

Set a [Global System Parameter.](global-parameters.md#system)

```ts
synth.setSystemParameter(type, value);
```

- type - the type of the parameter to set, a string of the parameter type.
- value - the value of the parameter to set, depends on the type.

### reset

Executes a full system reset of all controllers.
This will reset all controllers to their default values,
except for the locked controllers.

```ts
synth.reset();
```

### applySnapshot

Applies a [SynthesizerSnapshot](synthesizer-snapshot.md) to this synthesizer.

```ts
synth.applySnapshot(snapshot);
```

- snapshot - the snapshot to apply.

!!! WARNING

    This method overrides the existing system parameters with the ones from the snapshot.

### getSnapshot

Gets a [SynthesizerSnapshot](synthesizer-snapshot.md) instance of this synthesizer.

### createMIDIChannel

Creates a new MIDI channel and adds it to the synthesizer.

```ts
synth.createMIDIChannel();
```

### stopAllChannels

Stop all voices on all channels.

```ts
synth.stopAllChannels((force = false));
```

- force - if true,
  all notes are stopped immediately,
  otherwise they are stopped gracefully.

### destroySynthProcessor

Delete all internal values and free up the memory.

### clearCache

Clear the synthesizer's voice cache.

## Properties

### processorInitialized

A `Promise` that must be awaited before the processor can be used with a compressed sound bank.

### sampleRate

The sample rate in Hertz.

### onEventCall

This property can be defined as a function that listens for events.

Parameters the function gets called with an object:

- type - `SynthProcessorEventData` (string) - the event type.
- data - depends - the event data.

[Refer to the synth event types for all events.](event-types.md)

### midiChannels

All MIDI channels of the synthesizer, an array of `MIDIChannel`.

### midiParameters

The current [Global MIDI Parameters](global-parameters.md#midi) of the synthesizer.
These are only editable via MIDI messages.

Stored as key: value. Readonly.

### systemParameters

The current [Global System Parameters](global-parameters.md#system) of the synthesizer.
These are only editable via the API.

Stored as key: value. Readonly.

### voiceCount

The current total amount of voices that are playing, a number.

### currentTime

The current time of the synthesizer, in seconds.

### reverbProcessor

Synthesizer's reverb processor, a [`ReverbProcessor` instance](reverb-processor.md)

### chorusProcessor

Synthesizer's chorus processor, a [`ChorusProcessor` instance](chorus-processor.md)

### delayProcessor

Synthesizer's delay processor, a [`DelayProcessor` instance](delay-processor.md)

### soundBankManager

The [sound bank manager](sound-bank-manager.md) of this synthesizer.

### keyModifierManager

The [key modifier manager](key-modifier-manager.md) of this synthesizer.

### onMissingPreset

A handler for missing presets during program change. By default, it warns to console.
It may be useful for allowing the synthesizer to work without any sound banks.

Parameters the function gets called with:

- patch - `MIDIPatch` - the MIDI patch that was requested.
- system - `MIDISystem` (`gs`, `xg`, `gm` or `gm2`) - the MIDI System for the request.

If a `BasicPreset` instance is returned by the function, it will be used by the channel.
