# Modulator Class
Represents a single Modulator.

## Properties
All numbers
### sourcePolarity
The primary source's polarity.
### sourceDirection
The primary source's direction.
### sourceUsesCC
If the primary source uses a MIDI controller.
### sourceIndex
The index of the primary source.
### sourceCurveType
The primary source's curve types.


### secSrcPolarity
The secondary source's polarity.
### secSrcDirection
The secondary source's direction.
### secSrcUsesCC
If the secondary source uses a MIDI controller.
### secSrcIndex
The index of the secondary source.
### secSrcCurveType
The secondary source's curve types.

### modulatorDestination
The destination of the modulator. -1 if linked as it's not supported.
### transformType
The transform type to apply.
### transformAmount
The amount of transform to apply.


### Modulator sources
Below is the table of modulator sources if the usesCC flag is set to 0.

| Index | Name                |
|-------|---------------------|
| 0     | No controller = 1   |
| 2     | Note on velocity    |
| 3     | Note on key number  |
| 10    | Poly pressure       |
| 13    | Channel pressure    |
| 14    | Pitch Wheel         |
| 16    | Pitch Wheel range   |
| 127   | Link (UNSUPPORTED)  |


### Modulator curve types
Below are the defined curve types of modulators:
- 0 Linear - normal linear scale
- 1 Concave - exponential ramp
- 2 Convex - logarithmic ramp
- 3 Switch - 0.5 and below is 0 (or -1 for bipolar), above is 1


### Default Modulators
Below is the default modulator list for SpessaSynth.

> [!IMPORTANT]
> SpessaSynth implements the [default modulators proposal](https://github.com/spessasus/soundfont-proposals/blob/main/default_modulators.md).

Note: cB - centibels, 1/10 of a decibel

| Source                                     | Secondary source                           | Destination              | Transform amount  | Notes                         |
|--------------------------------------------|--------------------------------------------|--------------------------|-------------------|-------------------------------|
| Note On velocity Negative Unipolar Concave | No controller                              | Initial attenuation      | 960           cB  | SF2 Default                   |
| Modulation Wheel Positive Unipolar Linear  | No controller                              | Vibrato LFO to pitch     | 50         cents  | SF2 Default                   |
| Volume Negative Unipolar Concave           | No controller                              | Initial attenuation      | 960           cB  | SF2 Default                   |
| Channel Pressure Positive Unipolar Linear  | No controller                              | Vibrato LFO to pitch     | 50         cents  | SF2 Default                   |
| Pitch Wheel Positive Bipolar Linear        | Pitch wheel range Positive Unipolar Linear | Fine tune                | 12700      cents  | SF2 Default                   |
| Pan Positive Bipolar Linear                | No controller                              | Pan                      | 500      percent  | SF2 Default                   |
| Expression Negative Unipolar Concave       | No controller                              | Initial attenuation      | 960           cB  | SF2 Default                   |
| Reverb depth Negative Unipolar Linear      | No controller                              | Reverb effects send      | 1000      percent | SF2 Default, amount increased |
| Chorus depth Negative Unipolar Linear      | No controller                              | Chorus effects send      | 1000      percent | SF2 Default, amount increased |
| Poly Pressure Positive Unipolar Linear     | No controller                              | Vibrato LFO to pitch     | 50         cents  | ⚠️ NOT STANDARD ⚠️            |
| CC 92 depth Positive Unipolar Linear       | No controller                              | Mod LFO to volume        | 24            cB  | ⚠️ NOT STANDARD ⚠️            |
| CC 72 Positive Bipolar Convex              | No controller                              | Volume envelope attack   | 6000   timecents  | ⚠️ NOT STANDARD ⚠️            |
| CC 72 Positive Bipolar Linear              | No controller                              | Volume envelope release  | 3600   timecents  | ⚠️ NOT STANDARD ⚠️            |
| CC 74 Positive Bipolar Linear              | No controller                              | Initial Filter Cutoff    | 6000   abs cents  | ⚠️ NOT STANDARD ⚠️            |
| CC 71 Positive Bipolar Linear              | No controller                              | Initial Filter Resonance | 250           cB  | ⚠️ NOT STANDARD ⚠️            |

## Resonant modulator
SpessaSynth treats a specific modulator as a _resonant modulator._ That is:

- Source 1: CC 71 Positive Bipolar Linear  
- Source 2: No controller Positive Unipolar Linear (0x0)
- Destination: Initial Filter Resonance

This modulator is coded to not affect the DSP gain like the SF2 specification requires.
This is done because neither XG nor GS reacted that way to CC 71. 
Other than that, the filter is fully to the spec. 
All other modulators/generators affect the gain as the spec requires.

This approach allows the soundfont engineer to overwrite or delete the modulator, while maintaining the same behavior.

## Reverb and Chorus modulators
SpessaSynth has custom behavior for these modulators, emulating BASSMIDI:

- The modulators affected are all modulators
that use **Reverb depth Negative Unipolar Linear or Chorus depth Negative Unipolar Linear** as a primary source
and **No Controller* as the secondary source and either **reverbEffectsSend** or **chorusEffectsSend** as the destination
- The transform amount is multiplied by **5** if the initial transform amount is below 1000
- If the transform is multiplied, it is capped at **1000**

### Reasoning
The amount of 200 (SF2 default) is too low for these modulators, according to Ian from Un4seen.
I agree with him
and also set the default to 1000 (actually it's 200 multiplied by 5 which is 1000).
But this poses a few problems without using the solution above:
- soundfonts that assume default reverb of 200 will have almost inaudible effects.
For example, a soundfont might want to slightly decrease the reverb, by setting it to 150, for example.
It is way less than the default 1000, 
and the approach above will make it 150 * 5 = 750 which is still less than default,
but more audible.
- This approach still allows disabling these modulators.
- Some soundfonts assume a default reverb of 1000 and set some to 800 or similar. 
Using default 200 will cause a big imbalance between the custom and default modulators.