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

## Sub classes
