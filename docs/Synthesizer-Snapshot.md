# Synthesizer Snapshot
Represents a synthesizer's current state, which can be saved and restored.

## Obtaining
```js
const snapshot = SynthesizerSnapshot.createSynthesizerSnapshot(synth);
```
- synth - a `SpessaSynthProcessor` instance to use.

## Properties
### ChannelSnapshots
An array of [ChannelSnapshot](#channel-snapshot) instances for all the MIDI channels of the synth.

### keyMappings
An array of arrays of [KeyModifiers](Key-Modifier-Manager.md).

Stored as:
```js
const mapping = snapshot.keyMappings[channelNumber][midiNote];
```



## Channel Snapshot