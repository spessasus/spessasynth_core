# Synthesizer Snapshot

Represents a synthesizer's current state, which can be saved and restored.

This can be useful for creating a different processor (for example, for rendering to an audio file)
and copying the current processor's state.

## Usage

A `SynthesizerSnapshot` is an `interface`, not a class.
It is created by and applied to a `SpessaSynthProcessor` instance:

```ts
// Get the current state
const snapshot = synth.getSnapshot();

// Apply the state to the same or a different processor
synth.applySnapshot(snapshot);
```

## Properties

### midiChannels

An array of channel snapshots for all the MIDI channels of the synth.

### keyMappings

An array of arrays of [KeyModifiers](key-modifier-manager.md).

Stored as:

```ts
const mapping = snapshot.keyMappings[channelNumber][midiNote];
```

### systemParameters

All [system parameters](global-parameters.md) stored as a type: value pair.

### midiParameters

All global MIDI parameters stored as a type: value pair.

### reverbProcessor

A `ReverbProcessorSnapshot` of the reverb processor.

### chorusProcessor

A `ChorusProcessorSnapshot` of the chorus processor.

### delayProcessor

A `DelayProcessorSnapshot` of the delay processor.

### insertionProcessor

An `InsertionProcessorSnapshot` of the insertion effect processor.
