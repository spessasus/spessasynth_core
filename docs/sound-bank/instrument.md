# BasicInstrument

This class represents a single instrument, a layer below the BasicPreset

!!! Note

    Despite the name, this isn't what the MIDI selects. BasicPreset is the actual "instrument".
    
!!! Danger

    Properties and methods not listed here are internal only and should not be used.

## Properties

### name

The name of this instrument, a string.

### zones

The instrument's zones, an array of `BasicInstrumentZone`s.

### linkedTo

Instrument's linked presets (the presets that use it).
Note that duplicates are allowed since one preset can use the same instrument multiple times.

An array of `BasicPreset`s.

## Methods

### createZone

Creates a new instrument zone and returns it.

```ts
instrument.createZone(sample);
```

 - sample - the sample to use in the zone.

### deleteZone

Deletes a zone from this instrument.

```ts
instrument.deleteZone(index);
```

- index - the zero-based index of the zone to delete.

### delete

Unlinks everything from this instrument.


### globalize

Globalizes the instrument *in-place.*
This means trying to move as many generators and modulators 
to the global zone as possible to reduce clutter and the count of parameters.

Should have no effect on the audio produced.