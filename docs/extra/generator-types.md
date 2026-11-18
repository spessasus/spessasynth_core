---
title: Generator Types
---

# Generator Types

Below are all generator types defined by the SoundFont 2.04 specification,
followed by the SFe generators that `spessasynth_core` adds.

They are accessible through the {@link GeneratorTypes} enum.
The limits and default values are accessible through {@link GeneratorLimits}.

> **Important**
>
> Generator 48 (Initial Attenuation) is in true centibels, the same unit as Gain (86), so 100 is 10 dB.
> SoundFont2 files store 2.5 times that (the EMU8000 factor of 0.4). The SF2 reader multiplies each value by 0.4 and
> rounds, the SF2 writer divides by 0.4 and rounds, and the synthesizer does not scale it. A SoundFont2 file that is
> read and written again may change an attenuation value by one unit once. The limit is 0 to 1440 centibels, which is
> also the limit of the sum with its modulators.
>
> Some limits differ from the specification:
>
> - The delays, attacks and holds of both envelopes and the LFO delays go down to -32768 (instant) rather than -12000.
>   This matches their description in the specification ("-32768 conventionally indicates" no delay), but not the
>   table summary. Only -32768 itself is instant, other values below -12000 count as -12000. The defaults stay at
>   -12000. With no delay and no attack, a voice starts at full volume.
> - `spessasynth_core` differs from the SoundFont and SFe specifications in one default: Delay and Attack Modulation
>   Envelope default to -32768 and not to -12000, to prevent clicks in the lowpass filter.
> - Fine Tune allows the full +-12700 cents range, as the default pitch wheel modulator targets it.
> - Exclusive Class allows values up to 32767 rather than 127.

| Generator ID | Generator Name                          | Minimum Value | Maximum Value | Default Value | Description                                                                                                                                                               |
| ------------ | --------------------------------------- | ------------- | ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0            | Start Address Offset                    | 0             | 32768         | 0             | Sample control - moves sample start point                                                                                                                                 |
| 1            | End Address Offset                      | -32768        | 32768         | 0             | Sample control - moves sample end point                                                                                                                                   |
| 2            | Start Loop Address Offset               | -32768        | 32768         | 0             | Loop control - moves loop start point                                                                                                                                     |
| 3            | End Loop Address Offset                 | -32768        | 32768         | 0             | Loop control - moves loop end point                                                                                                                                       |
| 4            | Start Address Coarse Offset             | 0             | 32768         | 0             | Sample control - moves sample start point in 32768 increments                                                                                                             |
| 5            | Modulation LFO to Pitch                 | -12000        | 12000         | 0             | Pitch modulation - Modulation LFO pitch modulation in cents                                                                                                               |
| 6            | Vibrato LFO to Pitch                    | -12000        | 12000         | 0             | Pitch modulation - Vibrato LFO pitch modulation in cents                                                                                                                  |
| 7            | Modulation Envelope to Pitch            | -12000        | 12000         | 0             | Pitch modulation - Modulation envelope pitch modulation in cents                                                                                                          |
| 8            | Initial Filter Cutoff                   | 1500          | 13500         | 13500         | Filter - Lowpass filter cutoff in cents                                                                                                                                   |
| 9            | Initial Filter Resonance                | 0             | 960           | 0             | Filter - Lowpass filter resonance                                                                                                                                         |
| 10           | Modulation LFO to Filter Cutoff         | -12000        | 12000         | 0             | Filter modulation - Modulation LFO lowpass filter cutoff in cents                                                                                                         |
| 11           | Modulation Envelope to Filter Cutoff    | -12000        | 12000         | 0             | Filter modulation - Modulation envelope lowpass filter cutoff in cents                                                                                                    |
| 12           | End Address Coarse Offset               | -32768        | 32768         | 0             | Sample control - moves sample end point in 32768 increments                                                                                                               |
| 13           | Modulation LFO to Volume                | -960          | 960           | 0             | Modulation LFO - Volume (tremolo), where 100 = 10dB                                                                                                                       |
| 14           | Unused 1                                | -             | -             | -             | Unused                                                                                                                                                                    |
| 15           | Chorus Effects Send                     | 0             | 1000          | 0             | Effect send - How much is sent to chorus                                                                                                                                  |
| 16           | Reverb Effects Send                     | 0             | 1000          | 0             | Effect send - How much is sent to reverb                                                                                                                                  |
| 17           | Pan                                     | -500          | 500           | 0             | Panning - Where -500 = left, 0 = center, 500 = right                                                                                                                      |
| 18           | Unused 2                                | -             | -             | -             | Unused                                                                                                                                                                    |
| 19           | Unused 3                                | -             | -             | -             | Unused                                                                                                                                                                    |
| 20           | Unused 4                                | -             | -             | -             | Unused                                                                                                                                                                    |
| 21           | Delay Modulation LFO                    | -32768        | 5000          | -12000        | Mod LFO - Delay for Mod LFO to start from zero (weird scale)                                                                                                              |
| 22           | Frequency Modulation LFO                | -16000        | 4500          | 0             | Mod LFO - Frequency of Mod LFO, 0 = 8.176Hz, unit: f => 1200log2(f/8.176)                                                                                                 |
| 23           | Delay Vibrato LFO                       | -32768        | 5000          | -12000        | Vibrato LFO - Delay for vibrato LFO to start from zero (weird scale)                                                                                                      |
| 24           | Frequency Vibrato LFO                   | -16000        | 4500          | 0             | Vibrato LFO - Frequency of Vibrato LFO, 0 = 8.176Hz, unit: f => 1200log2(f/8.176)                                                                                         |
| 25           | Delay Modulation Envelope               | -32768        | 5000          | -32768        | Mod Envelope - 0 = 1s delay till Mod Envelope starts                                                                                                                      |
| 26           | Attack Modulation Envelope              | -32768        | 8000          | -32768        | Mod Envelope - Attack of Mod Envelope                                                                                                                                     |
| 27           | Hold Modulation Envelope                | -32768        | 5000          | -12000        | Mod Envelope - Hold of Mod Envelope                                                                                                                                       |
| 28           | Decay Modulation Envelope               | -12000        | 8000          | -12000        | Mod Envelope - Decay of Mod Envelope                                                                                                                                      |
| 29           | Sustain Modulation Envelope             | 0             | 1000          | 0             | Mod Envelope - Sustain of Mod Envelope                                                                                                                                    |
| 30           | Release Modulation Envelope             | -12000        | 8000          | -12000        | Mod Envelope - Release of Mod Envelope                                                                                                                                    |
| 31           | Key Number to Modulation Envelope Hold  | -1200         | 1200          | 0             | Mod Envelope - Also modulating Mod Envelope hold with key number                                                                                                          |
| 32           | Key Number to Modulation Envelope Decay | -1200         | 1200          | 0             | Mod Envelope - Also modulating Mod Envelope decay with key number                                                                                                         |
| 33           | Delay Volume Envelope                   | -32768        | 5000          | -12000        | Volume Envelope - Delay of envelope from zero (weird scale)                                                                                                               |
| 34           | Attack Volume Envelope                  | -32768        | 8000          | -12000        | Volume Envelope - Attack of envelope                                                                                                                                      |
| 35           | Hold Volume Envelope                    | -32768        | 5000          | -12000        | Volume Envelope - Hold of envelope                                                                                                                                        |
| 36           | Decay Volume Envelope                   | -12000        | 8000          | -12000        | Volume Envelope - Decay of envelope                                                                                                                                       |
| 37           | Sustain Volume Envelope                 | 0             | 1440          | 0             | Volume Envelope - Sustain of envelope                                                                                                                                     |
| 38           | Release Volume Envelope                 | -12000        | 8000          | -12000        | Volume Envelope - Release of envelope                                                                                                                                     |
| 39           | Key Number to Volume Envelope Hold      | -1200         | 1200          | 0             | Volume Envelope - Key number to volume envelope hold                                                                                                                      |
| 40           | Key Number to Volume Envelope Decay     | -1200         | 1200          | 0             | Volume Envelope - Key number to volume envelope decay                                                                                                                     |
| 41           | Instrument                              | -             | -             | -             | Zone - Instrument index to use for preset zone                                                                                                                            |
| 42           | Reserved 1                              | -             | -             | -             | Reserved                                                                                                                                                                  |
| 43           | Key Range                               | -             | -             | -             | Zone - Key range for which preset / instrument zone is active                                                                                                             |
| 44           | Velocity Range                          | -             | -             | -             | Zone - Velocity range for which preset / instrument zone is active                                                                                                        |
| 45           | Start Loop Address Coarse Offset        | -32768        | 32768         | 0             | Sample control - Moves sample loop start point in 32768 increments                                                                                                        |
| 46           | Key Number                              | -1            | 127           | -1            | Zone - Instrument only: Always use this MIDI number (ignore what's pressed)                                                                                               |
| 47           | Velocity                                | -1            | 127           | -1            | Zone - Instrument only: Always use this velocity (ignore what's pressed)                                                                                                  |
| 48           | Initial Attenuation                     | 0             | 1440          | 0             | Zone - Allows turning down the volume, in centibels, 100 = -10dB                                                                                                          |
| 49           | Reserved 2                              | -             | -             | -             | Reserved                                                                                                                                                                  |
| 50           | End Loop Address Coarse Offset          | -32768        | 32768         | 0             | Sample control - Moves sample loop end point in 32768 increments                                                                                                          |
| 51           | Coarse Tune                             | -120          | 120           | 0             | Tune - Pitch offset in semitones                                                                                                                                          |
| 52           | Fine Tune                               | -12700        | 12700         | 0             | Tune - Pitch offset in cents                                                                                                                                              |
| 53           | Sample ID                               | -             | -             | -             | Sample - Instrument zone only: Which sample to use                                                                                                                        |
| 54           | Sample Modes                            | 0             | 4             | 0             | Sample - 0 = no loop, 1 = loop, 2 = start on release (Polyphone extension, see below), 3 = loop and play till end in release phase, 4 = alternating loop (SFe, see below) |
| 55           | Reserved 3                              | -             | -             | -             | Reserved                                                                                                                                                                  |
| 56           | Scale Tuning                            | 0             | 1200          | 100           | Sample - The degree to which MIDI key number influences pitch, 100 = default                                                                                              |
| 57           | Exclusive Class                         | 0             | 32767         | 0             | Sample - Cut = choke group                                                                                                                                                |
| 58           | Overriding Root Key                     | -1            | 127           | -1            | Sample - Can override the sample's original pitch                                                                                                                         |
| 59           | Unused 5                                | -             | -             | -             | Unused                                                                                                                                                                    |
| 60           | End Marker                              | -             | -             | -             | End marker                                                                                                                                                                |

## SFe generators

These generators are not part of the SoundFont specification.
They are only stored in SFe banks. SF2 and SF3 files never contain them, and they are ignored when reading SF2 files.
Every default value makes the voice play exactly as it would without the generator.

- 61 to 73 extend the filter and the LFOs, in the SF2 order (filter, then the LFOs, modulation LFO first).
- 74 to 89 add a second modulation envelope, a second volume decay, voice features beyond the SoundFont model
  and a third effects send.

> **Tip**
>
> Consider reading [the SFe specification](https://spessasus.github.io/spessasynth_sfe/spec.html)

| Generator ID | Generator Name                     | Minimum Value | Maximum Value | Default Value | Description                                                                                                    |
| ------------ | ---------------------------------- | ------------- | ------------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| 61           | Filter Type                        | 0             | 4             | 0             | 0 = lowpass, 1 = highpass, 2 = bandpass, 3 = peak, 4 = notch                                                   |
| 62           | Maximum Filter Cutoff              | 1500          | 13500         | 13500         | Absolute cents, the modulated cutoff can not go above this. 13500 = no ceiling                                 |
| 63           | Filter Resonance Offset            | -960          | 960           | 0             | Centibels added to the clamped resonance, so the Q can go below 0.707 or above SF2's maximum                   |
| 64           | Vibrato LFO to Filter Cutoff       | -12000        | 12000         | 0             | Like Modulation LFO to Filter Cutoff, but for vibrato LFO                                                      |
| 65           | Vibrato LFO to Volume              | -960          | 960           | 0             | Like Modulation LFO to Volume, but for vibrato LFO                                                             |
| 66           | Modulation LFO Amplitude Depth     | -1000         | 1000          | 0             | Modulation LFO linear amplitude modulation in 0.1% units                                                       |
| 67           | Vibrato LFO Amplitude Depth        | -1000         | 1000          | 0             | Vibrato LFO linear amplitude modulation in 0.1% units                                                          |
| 68           | Fade Modulation LFO                | -32768        | 5000          | -32768        | Timecents, the modulation LFO ramps in over this time after its delay. -32768 = no fade                        |
| 69           | Fade Vibrato LFO                   | -32768        | 5000          | -32768        | Timecents, the vibrato LFO ramps in over this time after its delay. -32768 = no fade                           |
| 70           | Modulation LFO Waveform            | 0             | 3             | 0             | 0 = triangle, 1 = rising sawtooth, 2 = sine, 3 = square                                                        |
| 71           | Vibrato LFO Waveform               | 0             | 3             | 0             | 0 = triangle, 1 = rising sawtooth, 2 = sine, 3 = square                                                        |
| 72           | Modulation LFO Start Phase         | 0             | 360           | 0             | Degrees added to the start phase (0 = zero and rising, 90 = peak)                                              |
| 73           | Vibrato LFO Start Phase            | 0             | 360           | 0             | Degrees added to the start phase (0 = zero and rising, 90 = peak)                                              |
| 74           | Modulation Envelope 2 to Pitch     | -12000        | 12000         | 0             | Cents, like Modulation Envelope to Pitch                                                                       |
| 75           | Modulation Envelope 2 to Filter Fc | -12000        | 12000         | 0             | Cents, like Modulation Envelope to Filter Cutoff                                                               |
| 76           | Delay Modulation Envelope 2        | -32768        | 5000          | -32768        | Like Delay Modulation Envelope, for the second modulation envelope                                             |
| 77           | Attack Modulation Envelope 2       | -32768        | 8000          | -32768        | Like Attack Modulation Envelope, for the second modulation envelope                                            |
| 78           | Hold Modulation Envelope 2         | -32768        | 5000          | -32768        | Like Hold Modulation Envelope, for the second modulation envelope                                              |
| 79           | Decay Modulation Envelope 2        | -12000        | 8000          | -12000        | Like Decay Modulation Envelope, for the second modulation envelope                                             |
| 80           | Sustain Modulation Envelope 2      | 0             | 1000          | 0             | Like Sustain Modulation Envelope, for the second modulation envelope                                           |
| 81           | Release Modulation Envelope 2      | -12000        | 8000          | -12000        | Like Release Modulation Envelope, for the second modulation envelope                                           |
| 82           | Key Number to Mod Envelope 2 Hold  | -1200         | 1200          | 0             | Like Key Number to Mod Envelope Hold, for the second modulation envelope                                       |
| 83           | Key Number to Mod Envelope 2 Decay | -1200         | 1200          | 0             | Like Key Number to Mod Envelope Decay, for the second modulation envelope                                      |
| 84           | Decay 2 Volume Envelope            | -12000        | 8000          | -12000        | Timecents for 96 dB, the second decay segment that follows the decay                                           |
| 85           | Sustain 2 Volume Envelope          | -1440         | 1440          | 0             | Centibels relative to the sustain, where the second decay ends. 0 = no second decay                            |
| 86           | Gain                               | -1440         | 1440          | 0             | Centibels added to the voice level, positive = louder (the reverse of Initial Attenuation)                     |
| 87           | Delay Voice                        | -32768        | 5000          | -32768        | Timecents, the whole voice (sample, envelopes, LFOs) starts this late. -32768 = no delay                       |
| 88           | Ignore Note Off                    | 0             | 1             | 0             | 1 = note off and the sustain pedal do not release the voice, it plays until its volume envelope or sample ends |
| 89           | Variation Effects Send             | 0             | 1000          | 0             | Effect send - how much is sent to the variation effect (GS delay, XG variation) 0 - 1000                       |

## Sample Modes 2

The SF2 specification marks `sampleModes` 2 as unused and says to treat it as "no loop".
SpessaSynth and SFe define it as "start on release" (an extension introduced by Polyphone 2.4): the sample starts
playing on release (note off), so it stays silent while the key is held. Files that write 2 for a different reason
will be silent until note off.

## Sample Modes 4

SFe adds `sampleModes` 4, an alternating (ping-pong) loop. The sample plays forward to the point before the loop end,
then backward to the loop start, and repeats, playing each turn point once. It keeps looping in the release phase,
like mode 1. SF2 and DLS have no such loop, so the generator is dropped when writing them.
See [the SFe specification](https://spessasus.github.io/spessasynth_sfe/spec.html#71-generator-and-modulator-destination-enumerators).
