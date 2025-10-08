# SpessaSynthSequencer

This module is responsible for playing back `BasicMIDI` sequences to `SpessaSynthProcessor`.

## Initialization

```ts
const seq = new SpessaSynthSequencer(processor);
```

- processor - `SpessaSynthProcessor` to connect the sequencer to.

## Properties

### midiData

`BasicMIDI`, the current song playing.

### songs

An array of `BasicMIDI`s, the current song list.

### shuffledSongIndexes

The shuffled song indexes.
This is used when shuffleMode is enabled.
An array of numbers.

### synth

The `SpessaSynthProcessor` this sequencer uses.

### externalMIDIPlayback

If the MIDI messages should be sent to an event instead of the synth.
This is used by spessasynth_lib to pass them over to Web MIDI API.

If true, MIDI events will be emitted.

### loopCount

The loop count of the sequencer.
If infinite, it will loop forever.
If zero, the loop is disabled.

### skipToFirstNoteOn

Indicates if the sequencer should skip to the first note on event.
Defaults to true.


### onEventCall

Called when the sequencer calls an event
with an object containing two properties:

- type - the type of event, a string.
- data - the data of the event, an object.

See [event types](event-types.md) for more info.


### processTick

Processes a single MIDI tick.
You should call this every rendering quantum to process the sequencer events in real-time.

### duration

The length of the current sequence in seconds.

### songIndex

The current song index in the song list.
If shuffleMode is enabled, this is the index of the shuffled song list.

This field can be set to trigger a change.


### shuffleMode

Controls if the sequencer should shuffle the songs in the song list.
If true, the sequencer will play the songs in a random order.

This field can be set to trigger a change.

### playbackRate

The sequencer's playback rate.
This is the rate at which the sequencer plays back the MIDI data.

This field can be set to trigger a change.

### currentTime

The current time of the sequencer.
This is the time in seconds since the sequencer started playing.

This field can be set to trigger a change.

### paused

A boolean indicating if the sequencer is currently paused.

### isFinished

A boolean indicating if the sequencer has finished playing.

### preload

A boolean indicating if the smart preloading should be enabled. It is highly recommended.

## Methods

### play

Starts or resumes the playback of the sequencer.
If the sequencer is paused, it will resume from the paused time.


### pause

Pauses the playback.

### loadNewSongList

Loads a new song list into the sequencer.

```ts
seq.loadNewSongList(midiBuffers);
```

- midiBuffers - an array of `BasicMIDI`s to load.