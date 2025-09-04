# ModulatorSource

!!! Danger

    Properties and methods not listed here are internal only and should not be used.


This class represents a single modulator source.

## Properties

### isBipolar

From the SF2 specification:

> If this field is set to false, the controller should be mapped with a minimum value of 0 and a maximum value of 1. This is also
called Unipolar. Thus, it behaves similar to the Modulation Wheel controller of the MIDI specification.
>
> If this field is set to true, the controller sound be mapped with a minimum value of -1 and a maximum value of 1. This is also
called Bipolar. Thus, it behaves similar to the Pitch Wheel controller of the MIDI specification.

A boolean.

### isNegative

From the SF2 specification:

> If this field is set true, the direction of the controller should be from the maximum value to the minimum value. So, for
  example, if the controller source is Key Number, then a Key Number value of 0 corresponds to the maximum possible
  controller output, and the Key Number value of 127 corresponds to the minimum possible controller input.

A boolean.

### index

The index of the source.
It can point to one of the MIDI controllers or one of the predefined sources, depending on the 'isCC' flag.

A numeric enum.

### isCC

Indicates if the index points to one of the predefined SF2 sources or one of the MIDI controllers.

A boolean.

### curveType

This field specifies how the minimum value approaches the maximum value.
One of the predefined `modulatorCurveTypes`.

## Methods

### toString

Returns a human-readable string of this source. Useful for debugging.

### isIdentical

Checks if the source is identical to another one

```ts
source.isIdentical(source);
```

- source - the `ModulatorSource` to compare.
