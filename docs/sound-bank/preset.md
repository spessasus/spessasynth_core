# BasicPreset

Represents a single preset (MIDI instrument)


## Properties

!!! Note

    This class is also a [MIDI patch](../spessa-synth-processor/midi-patch.md) and contains all of its properties.

### name

The preset's name as a string.

### globalZone

A 

## Methods

### getSynthesisData

Returns the SF2 synthesis data for a given note and velocity.

```ts
const synthesisData = preset.getSynthesisData(midiNote, velocity);
```

- midiNote - the note to get data for. Ranges from 0 to 127.
- velocity - the velocity to get data for. Ranges from 0 to 127.

The returned value is an array of objects:

- instrumentGenerators - an array of [`Generator`](generator.md)s.
- presetGenerators - an array of [`Generator`](generator.md)s.
- modulators - an array of [`Generator`](modulator.md)s.
- sample - a [`BasicSample`](sample.md)