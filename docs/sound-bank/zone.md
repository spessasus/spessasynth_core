# BasicZone

This class represents a single zone.

## Properties

### velRange

The zone's velocity range.

An object:

- min - the minimum velocity. A value of -1 means "unset" (maximum range)
- max - the maximum velocity.

### keyRange

The zone's key range.

An object:

- min - the minimum key number. A value of -1 means "unset" (maximum range)
- max - the maximum key number.

### hasKeyRange

A boolean indicating if the zone has explicitly set key range.

### generators

The zone's generators, an array of [`Generator`](generator.md)s.

### modulators

The zone's generators, an array of [`Modulators`](modulator.md)s.

### fineTuning

Allows setting and getting zone's fine-tuning in cents, taking in both coarse and fine generators.

## methods

### setGenerator

Sets a generator to a given value.

```ts
zone.setGenerator(type, value, (validate = true));
```

- type - the one of the SF2 generator types, a number. `generatorTypes` enum contains all of them.
- value - the value to set it to, a number. Set to `null` to delete the generator (unset).
- validate - optional validation for the limits defined in the SF2 specification. recommended.

### getGenerator

Gets a given generator value.

```ts
zone.getGenerator(type, notFoundValue);
```

- type - the one of the SF2 generator types, a number. `generatorTypes` enum contains all of them.
- notFoundValue - what to return if the generator wasn't found. Any type or undefined.

### copyFrom

Copies the data from a given zone.

```ts
zone.copyFrom(zone);
```

- zone - the `BasicZone` to copy from.

## Sub classes

### BasicInstrumentZone

Represents an instrument zone with a sample.

#### parentInstrument

The instrument this zone belongs to, a `BasicInstrument` instance.

#### sample

The sample for this zone, a `BasicSample` instance.

### BasicPresetZone

Represents a single preset zone with an instrument.

#### parentPreset

The preset this zone belongs to, a `BasicPreset` instance.

#### instrument

The instrument for this zone, a `BasicInstrument` instance.
