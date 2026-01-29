# Synthesizer Snapshot

Represents a synthesizer's current state, which can be saved and restored.

This can be useful for creating a different processor (for example, for rendering to an audio file)
and copying the current processor's state.

## Methods

### create

Creates a synthesizer snapshot from a `SpessaSynthProcessor` instance.

!!! Note

    This method is *static.*

```ts
const snapshot = SynthesizerSnapshot.create(synth);
```

- synth - a `SpessaSynthProcessor` instance to use.

### copyFrom

Creates a copy of existing snapshot.

```ts
SynthesizerSnapshot.copyFrom(snapshot);
```

- snapshot - the snapshot to create a copy from.

!!! Note

    This method is *static.*

### apply

Applies the snapshot to a `SpessaSynthProcessor`.

```ts
snapshot.apply(synth);
```

- synth - the processor to apply the snapshot to.

## Properties

### channelSnapshots

An array of ChannelSnapshot instances for all the MIDI channels of the synth.

### keyMappings

An array of arrays of [KeyModifiers](key-modifier-manager.md).

Stored as:

```ts
const mapping = snapshot.keyMappings[channelNumber][midiNote];
```

### masterParameters

All [master parameters](master-parameter.md) stored as a type: value pair.
