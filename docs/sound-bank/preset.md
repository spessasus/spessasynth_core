# BasicPreset

Represents a single preset (MIDI instrument)

!!! Danger

    Properties and methods not listed here are internal only and should not be used.

## Properties

!!! Note

    This class is a [MIDI patch](../spessa-synth-processor/midi-patch.md) and contains all of its properties.

### name

The preset's name as a string.

### globalZone

The global zone for this preset, a `BasicZone`.

### zones

The zones of this preset, an array of `BasicPresetZone`s.

### isXGDrums

A boolean indicating if this preset is an XG drum preset.

### isAnyDrums

A boolean indicating if this preset is a drum preset.

### library

Unused numeric metadata.

### genre

Unused numeric metadata.

### morphology

Unused numeric data.

## Methods

### createZone

Creates a new preset zone and returns it.

```ts
preset.createZone(instrument);
```

 - instrument - the instrument to use in the zone.

### deleteZone

Deletes a zone from this preset.

```ts
preset.deleteZone(index);
```

- index - the zero-based index of the zone to delete.

### delete

Unlinks everything from this preset.

### preload

Preloads (loads and caches synthesis data) for a given key range.

```ts
preset.preload(keyMin, keyMax);
```

- keyMin, keyMax - the range of MIDI notes.

### matches

Checks if the bank and program numbers are the same for the given preset as this one.

```ts
preset.matches(patch);
```

- path - a MIDI patch to check.

### toMIDIString

Returns a MIDI Patch formatted string.


### toString

Returns a MIDI Patch formatted string and preset's name combined.

### toFlattenedInstrument

Combines preset into an instrument, flattening the preset zones into instrument zones.
This is a really complex function that attempts to work around the DLS limitations of only having the instrument layer.

It returns the `BasicInstrument` containing the flattened zones.
In theory, it should exactly the same as this preset.

### getVoiceParameters

Returns the voice synthesis data for a given note and velocity.

```ts
const synthesisData = preset.getVoiceParameters(midiNote, velocity);
```

- midiNote - the note to get data for. Ranges from 0 to 127.
- velocity - the velocity to get data for. Ranges from 0 to 127.

The returned value is an array of objects:

- generators - an `Int16Array` containing the generator values at their respective indexes (`generators[type] = value`). Note that the E-mu attenuation correction is already performed.
- modulators - an array of [`Modulator`](modulator.md)s.
- sample - a [`BasicSample`](sample.md)