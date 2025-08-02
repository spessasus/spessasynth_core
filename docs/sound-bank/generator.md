# Generator class

This class represents a single generator.

## Properties

### generatorType

An enum, see below.

```ts
console.log(generator.generatorType); // 48 - initial attenuation
```

### generatorValue

The generator's value can be negative.

```ts
console.log(generator.generatorValue); // -10
```

## All generator types

Below are all defined generator types as of soundfont 2.04.

!!! Important

    Generator 48 (Initial Attenuation) applies a 0.04 multiplier instead of 0.1 multiplier like in the spec. 
    Every soundfont synth does this to remain compatible, unfortunately.

| Generator ID | Generator Name                          | Minimum Value | Maximum Value | Default Value | Description                                                                               |
|--------------|-----------------------------------------|---------------|---------------|---------------|-------------------------------------------------------------------------------------------|
| 0            | Start Address Offset                    | 0             | 32768         | 0             | Sample control - moves sample start point                                                 |
| 1            | End Address Offset                      | -32768        | 32768         | 0             | Sample control - moves sample end point                                                   |
| 2            | Start Loop Address Offset               | -32768        | 32768         | 0             | Loop control - moves loop start point                                                     |
| 3            | End Loop Address Offset                 | -32768        | 32768         | 0             | Loop control - moves loop end point                                                       |
| 4            | Start Address Coarse Offset             | 0             | 32768         | 0             | Sample control - moves sample start point in 32767 increments                             |
| 5            | Modulation LFO to Pitch                 | -12000        | 12000         | 0             | Pitch modulation - Modulation LFO pitch modulation in cents                               |
| 6            | Vibrato LFO to Pitch                    | -12000        | 12000         | 0             | Pitch modulation - Vibrato LFO pitch modulation in cents                                  |
| 7            | Modulation Envelope to Pitch            | -12000        | 12000         | 0             | Pitch modulation - Modulation envelope pitch modulation in cents                          |
| 8            | Initial Filter Cutoff                   | 1500          | 13500         | 13500         | Filter - Lowpass filter cutoff in cents                                                   |
| 9            | Initial Filter Resonance                | 0             | 960           | 0             | Filter - Lowpass filter resonance                                                         |
| 10           | Modulation LFO to Filter Cutoff         | -12000        | 12000         | 0             | Filter modulation - Modulation LFO lowpass filter cutoff in cents                         |
| 11           | Modulation Envelope to Filter Cutoff    | -12000        | 12000         | 0             | Filter modulation - Modulation envelope lowpass filter cutoff in cents                    |
| 12           | End Address Coarse Offset               | -32768        | 32768         | 0             | Sample control - Moves sample end point in 32767 increments                               |
| 13           | Modulation LFO to Volume                | -960          | 960           | 0             | Modulation LFO - Volume (tremolo), where 100 = 10dB                                       |
| 14           | Unused 1                                | -             | -             | -             | Unused                                                                                    |
| 15           | Chorus Effects Send                     | 0             | 1000          | 0             | Effect send - How much is sent to chorus                                                  |
| 16           | Reverb Effects Send                     | 0             | 1000          | 0             | Effect send - How much is sent to reverb                                                  |
| 17           | Pan                                     | -500          | 500           | 0             | Panning - Where -500 = left, 0 = center, 500 = right                                      |
| 18           | Unused 2                                | -             | -             | -             | Unused                                                                                    |
| 19           | Unused 3                                | -             | -             | -             | Unused                                                                                    |
| 20           | Unused 4                                | -             | -             | -             | Unused                                                                                    |
| 21           | Delay Modulation LFO                    | -12000        | 5000          | -12000        | Mod LFO - Delay for Mod LFO to start from zero (weird scale)                              |
| 22           | Frequency Modulation LFO                | -16000        | 4500          | 0             | Mod LFO - Frequency of Mod LFO, 0 = 8.176Hz, unit: f => 1200log2(f/8.176)                 |
| 23           | Delay Vibrato LFO                       | -12000        | 5000          | -12000        | Vibrato LFO - Delay for vibrato LFO to start from zero (weird scale)                      |
| 24           | Frequency Vibrato LFO                   | -16000        | 4500          | 0             | Vibrato LFO - Frequency of Vibrato LFO, 0 = 8.176Hz, unit: f => 1200log2(f/8.176)         |
| 25           | Delay Modulation Envelope               | -12000        | 5000          | -12000        | Mod Envelope - 0 = 1s delay till Mod Envelope starts                                      |
| 26           | Attack Modulation Envelope              | -12000        | 8000          | -12000        | Mod Envelope - Attack of Mod Envelope                                                     |
| 27           | Hold Modulation Envelope                | -12000        | 5000          | -12000        | Mod Envelope - Hold of Mod Envelope                                                       |
| 28           | Decay Modulation Envelope               | -12000        | 8000          | -12000        | Mod Envelope - Decay of Mod Envelope                                                      |
| 29           | Sustain Modulation Envelope             | 0             | 1000          | 0             | Mod Envelope - Sustain of Mod Envelope                                                    |
| 30           | Release Modulation Envelope             | -12000        | 8000          | -12000        | Mod Envelope - Release of Mod Envelope                                                    |
| 31           | Key Number to Modulation Envelope Hold  | -1200         | 1200          | 0             | Mod Envelope - Also modulating Mod Envelope hold with key number                          |
| 32           | Key Number to Modulation Envelope Decay | -1200         | 1200          | 0             | Mod Envelope - Also modulating Mod Envelope decay with key number                         |
| 33           | Delay Volume Envelope                   | -12000        | 5000          | -12000        | Volume Envelope - Delay of envelope from zero (weird scale)                               |
| 34           | Attack Volume Envelope                  | -12000        | 8000          | -12000        | Volume Envelope - Attack of envelope                                                      |
| 35           | Hold Volume Envelope                    | -12000        | 5000          | -12000        | Volume Envelope - Hold of envelope                                                        |
| 36           | Decay Volume Envelope                   | -12000        | 8000          | -12000        | Volume Envelope - Decay of envelope                                                       |
| 37           | Sustain Volume Envelope                 | 0             | 1440          | 0             | Volume Envelope - Sustain of envelope                                                     |
| 38           | Release Volume Envelope                 | -7200         | 8000          | -12000        | Volume Envelope - Release of envelope (prevents clicks)                                   |
| 39           | Key Number to Volume Envelope Hold      | -1200         | 1200          | 0             | Volume Envelope - Key number to volume envelope hold                                      |
| 40           | Key Number to Volume Envelope Decay     | -1200         | 1200          | 0             | Volume Envelope - Key number to volume envelope decay                                     |
| 41           | Instrument                              | -             | -             | -             | Zone - Instrument index to use for preset zone                                            |
| 42           | Reserved 1                              | -             | -             | -             | Reserved                                                                                  |
| 43           | Key Range                               | -             | -             | -             | Zone - Key range for which preset / instrument zone is active                             |
| 44           | Velocity Range                          | -             | -             | -             | Zone - Velocity range for which preset / instrument zone is active                        |
| 45           | Start Loop Address Coarse Offset        | -32768        | 32768         | 0             | Sample control - Moves sample loop start point in 32767 increments                        |
| 46           | Key Number                              | -1            | 127           | -1            | Zone - Instrument only: Always use this MIDI number (ignore what's pressed)               |
| 47           | Velocity                                | -1            | 127           | -1            | Zone - Instrument only: Always use this velocity (ignore what's pressed)                  |
| 48           | Initial Attenuation                     | -250          | 1440          | 0             | Zone - Allows turning down the volume, 250 = -10dB                                        |
| 49           | Reserved 2                              | -             | -             | -             | Reserved                                                                                  |
| 50           | End Loop Address Coarse Offset          | -32768        | 32768         | 0             | Sample control - Moves sample loop end point in 32767 increments                          |
| 51           | Coarse Tune                             | -120          | 120           | 0             | Tune - Pitch offset in semitones                                                          |
| 52           | Fine Tune                               | -99           | 99            | 0             | Tune - Pitch offset in cents                                                              |
| 53           | Sample ID                               | -             | -             | -             | Sample - Instrument zone only: Which sample to use                                        |
| 54           | Sample Modes                            | 0             | 3             | 0             | Sample - 0 = no loop, 1 = loop, 2 = reserved, 3 = loop and play till end in release phase |
| 55           | Reserved 3                              | -             | -             | -             | Reserved                                                                                  |
| 56           | Scale Tuning                            | 0             | 1200          | 100           | Sample - The degree to which MIDI key number influences pitch, 100 = default              |
| 57           | Exclusive Class                         | 0             | 99999         | 0             | Sample - Cut = choke group                                                                |
| 58           | Overriding Root Key                     | -1            | 127           | -1            | Sample - Can override the sample's original pitch                                         |
| 59           | Unused 5                                | -             | -             | -             | Unused                                                                                    |
| 60           | End Marker                              | -             | -             | -             | End marker                                                                                |
