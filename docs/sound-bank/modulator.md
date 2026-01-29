# Modulator

!!! Danger

    Properties and methods not listed here are internal only and should not be used.

This class represents a single modulator (map from a source to a given synthesis parameter)

## ModulatorSource

Represents a single modulator source.

Properties below:

###

## Properties

### primarySource

The modulator's primary source, a `ModulatorSource` instance.

### secondarySource

The modulator's secondary source, a `ModulatorSource` instance.

### destination

The destination of the modulator, a `GeneratorType`.

### transformType

The transform type to apply. Usually 0, very rarely 2 which means absolute value.

### transformAmount

The transform amount (multiplier) of this modulator. Number.

## Methods

### isIdentical

Checks if the pair of modulators is identical (in SF2 terms)

```ts
Modulator.isIdentical(mod1, mod2, checkAmount);
```

- mod1, mod2 - the modulators to compare.
- checkAmount - If the amount should be checked too.

!!! Note

    This method is *static.*

### copyFrom

Copies a modulator.

```ts
Modulator.copyFrom(mod);
```

- mod - the modulator to copy.

!!! Note

    This method is *static.*

### toString

Returns a human-readable form of the modulator with named sources and destinations.
Useful for debugging.

## Modulator sources

Below is the table of modulator sources if the usesCC flag is set to 0.

| Index | Name               | Description                                                                                                                                                                                                         |
| ----- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | No controller = 1  | Always returns 1.                                                                                                                                                                                                   |
| 2     | Note on velocity   | The MIDI velocity the note was pressed with.                                                                                                                                                                        |
| 3     | Note on key number | The MIDI key number received.                                                                                                                                                                                       |
| 10    | Poly pressure      | The MIDI poly pressure message received for this note number.                                                                                                                                                       |
| 13    | Channel pressure   | The MIDI channel pressure message received for this channel.                                                                                                                                                        |
| 14    | Pitch Wheel        | The pitch wheel value, 14-bit.                                                                                                                                                                                      |
| 16    | Pitch Wheel range  | The range of the pitch wheel, in semitones.                                                                                                                                                                         |
| 127   | Link (UNSUPPORTED) | Other modulator. This feature is underspecified and not implemented, [similarly to fluidsynth](https://github.com/FluidSynth/fluidsynth/wiki/SoundFont#fluidsynths-implementation-details-of-the-soundfont-2-spec). |

## Modulator curve types

Below are the defined curve types of modulators:

- 0 Linear - normal linear scale
- 1 Concave - exponential ramp
- 2 Convex - logarithmic ramp
- 3 Switch - 0.5 and below is 0 (or -1 for bipolar), above is 1

## Default Modulators

Below is the default modulator list for SpessaSynth.

!!! Important

    SpessaSynth implements the [default modulators proposal](https://github.com/spessasus/soundfont-proposals/blob/main/default_modulators.md).

Note: cB - centibels, 1/10 of a decibel

### SF2 Default

These are the default modulators, as defined by the SF2.04 specification.
Note that the [velocity to filter modulator is intentionally omitted](https://github.com/FluidSynth/fluidsynth/wiki/SoundFont#fluidsynths-implementation-details-of-the-soundfont-2-spec).

| Source                       | Source Transform          | Secondary source                           | Destination          | Transform amount |
| ---------------------------- | ------------------------- | ------------------------------------------ | -------------------- | ---------------- |
| Note On Velocity             | Negative Unipolar Concave | -                                          | Initial attenuation  | 960 cB           |
| **CC 1** (Modulation Wheel)  | Positive Unipolar Linear  | -                                          | Vibrato LFO to pitch | 50 cents         |
| **CC 7** (Volume)            | Negative Unipolar Concave | -                                          | Initial attenuation  | 960 cB           |
| **CC 13** (Channel Pressure) | Positive Unipolar Linear  | -                                          | Vibrato LFO to pitch | 50 cents         |
| Pitch Wheel                  | Positive Bipolar Linear   | Pitch wheel range Positive Unipolar Linear | Fine tune            | 12700 cents      |
| **CC 10** (Pan)              | Positive Bipolar Linear   | -                                          | Pan                  | 500 percent      |
| **CC 11** (Expression)       | Negative Unipolar Concave | -                                          | Initial attenuation  | 960 cB           |
| **CC 91** (Reverb Depth)     | Negative Unipolar Linear  | -                                          | Reverb effects send  | 200 percent      |
| **CC 93** (Chorus Depth)     | Negative Unipolar Linear  | -                                          | Chorus effects send  | 200 percent      |

### Custom modulators

SpessaSynth applies a few extra modulators for extended compatibility with various MIDI standards.

| Source                       | Source Transform         | Secondary source | Destination              | Transform amount |
| ---------------------------- | ------------------------ | ---------------- | ------------------------ | ---------------- |
| Poly Pressure                | Positive Unipolar Linear | -                | Vibrato LFO to pitch     | 50 cents         |
| **CC 8** (Balance)           | Positive Bipolar Linear  | -                | Pan                      | 500 percent      |
| **CC 67** (Soft Pedal)       | Switch Unipolar Positive | -                | Initial attenuation      | 50 cB            |
| **CC 67** (Soft Pedal)       | Switch Unipolar Positive | -                | Initial Filter Cutoff    | -2400 abs cents  |
| **CC 71** (Filter Resonance) | Positive Bipolar Linear  | -                | Initial Filter Resonance | 200 cB           |
| **CC 72** (Vol Env Attack)   | Positive Bipolar Convex  | -                | Volume envelope attack   | 6000 timecents   |
| **CC 73** (Vol Env Release)  | Positive Bipolar Linear  | -                | Volume envelope release  | 3600 timecents   |
| **CC 74** (Filter Cutoff)    | Positive Bipolar Linear  | -                | Initial Filter Cutoff    | 9600 abs cents   |
| **CC 75** (Vol Env Decay)    | Positive Bipolar Linear  | -                | Volume envelope decay    | 3600 timecents   |
| **CC 92** (Tremolo Depth)    | Positive Unipolar Linear | -                | Mod LFO to volume        | 24 cB            |

### Resonant modulator

SpessaSynth treats a specific modulator as a _resonant modulator._ That is:

- Source 1: CC 71 Positive Bipolar Linear
- Source 2: No controller Positive Unipolar Linear (0x0)
- Destination: Initial Filter Resonance

This modulator is coded to not affect the DSP gain like the SF2 specification requires.
This is done because neither XG nor GS reacted that way to CC 71.
Other than that, the filter is fully to the spec.
All other modulators/generators affect the gain as the spec requires.

This approach allows the soundfont engineer to overwrite or delete the modulator, while maintaining the same behavior.

### Reverb and Chorus modulators

SpessaSynth has custom behavior for these modulators, emulating BASSMIDI:

- The modulators affected are all modulators
  that use **Reverb depth Negative Unipolar Linear or Chorus depth Negative Unipolar Linear** as a primary source
  and **No Controller\* as the secondary source and either **reverbEffectsSend** or **chorusEffectsSend\*\* as the
  destination
- The transform amount is multiplied by **5** if the initial transform amount is below 1000
- If the transform is multiplied, it is capped at **1000**

#### Reasoning

The amount of 200 (SF2 default) is too low for these modulators, according to Ian from Un4seen.
I agree with him
and also set the default to 1000 (actually it's 200 multiplied by 5 which is 1000).
But this poses a few problems without using the solution above:

- soundfonts that assume default reverb of 200 will have almost inaudible effects.
  For example, a soundfont might want to slightly decrease the reverb, by setting it to 150, for example.
  It is way less than the default 1000,
  and the approach above will make it 150 \* 5 = 750 which is still less than default,
  but more audible.
- This approach still allows disabling these modulators.
- Some soundfonts assume a default reverb of 1000 and set some to 800 or similar.
  Using default 200 will cause a big imbalance between the custom and default modulators.
