---
title: MIDI Implementation
---

# MIDI Implementation

This page describes what messages {@link SpessaSynthProcessor} can receive.
The supported standards are:

- MIDI 1.0 Protocol
- General MIDI Level 1
- General MIDI Level 2
- Roland GS
- Yamaha XG.

> **Tip**
>
> [Here is a useful resource about the MIDI standard. It's in japanese, but all the PDFs are english.](https://amei.or.jp/midistandardcommittee/RP&CAj.html)

## Supported MIDI Messages

Below is the list of supported MIDI messages.

| Message           | Supported? | Notes                                                                                                                   |
| ----------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Note On           | ✔️         | [More info](#overlapping-notes)                                                                                         |
| Note Off          | ✔️         | Does not support note off velocity (Per SF2 specification) [More info](#overlapping-notes)                              |
| Poly Pressure     | ✔️         | Recognized, but no default behavior (Per SF2 specification). It has to be defined with modulators or System Exclusives. |
| Controller Change | ✔️         | [More info](#default-supported-controllers)                                                                             |
| Program Change    | ✔️         | More info: {@link MIDIPatch}                                                                                            |
| Channel Pressure  | ✔️         | 50 cents of vibrato (Per SF2 specification)                                                                             |
| Pitch Wheel       | ✔️         | Controlled by Pitch Wheel Range. [More info](#per-note-pitch-wheel).                                                    |
| System Exclusive  | ✔️         | [More info](#system-exclusives)                                                                                         |
| Time Code         | ❌         | Not Applicable                                                                                                          |
| Song Position     | ❌         | Not Applicable                                                                                                          |
| Song Select       | ❌         | Not Applicable                                                                                                          |
| Tune Request      | ❌         | Not Applicable                                                                                                          |
| MIDI Clock        | ❌         | Not Applicable                                                                                                          |
| MIDI Start        | ❌         | Not Applicable                                                                                                          |
| MIDI Continue     | ❌         | Not Applicable                                                                                                          |
| MIDI Stop         | ❌         | Not Applicable                                                                                                          |
| Active Sense      | ❌         | Not Applicable                                                                                                          |
| System Reset      | ✔️         | This message can only be received via live MIDI input, as 0xFF in MIDI files means a meta message.                      |

### Per-Note Pitch Wheel

As of 4.1.0 SpessaSynth supports per-note Pitch Wheel as a part of the MIDI 2.0 specification.
Per-note mode is activated through the API and deactivated on channel or system reset.

> **Note**
>
> This is API-only, there are no MIDI messages that allow for changing it for now.

## Controllers

### Default Supported Controllers

Below is the list of controllers supported by default.

> **Note**
>
> Any MIDI CC may affect synthesis through modulators,
> but the controllers below have built-in behavior or default modulators.

Legend for the "Type" column:

- SF2 - Support for this controller is provided by an SF2 default modulator, can be disabled via DMOD.
- Extended - Support for this controller is provided by a non-SF2 default modulator, can be disabled via DMOD.
- Engine - Support for this controller is provided with a custom behavior, _cannot_ be disabled via DMOD.

> **Note**
>
> For exact values of the modulators, see [default modulators](../extra/modulator-information.md#default-modulators)

| CC#                  | Controller Name                     | Type     | Behavior                                                                                                                                                                            |
| -------------------- | ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0                    | Bank Select                         | Engine   | Changes the bank number that is used in Program Change. More info: {@link MIDIPatch}                                                                                                |
| 1                    | Modulation Wheel                    | SF2      | Controls the vibrato for the given patch.                                                                                                                                           |
| 5                    | Portamento Time                     | Engine   | Controls the portamento time. [More info](#portamento-implementation)                                                                                                               |
| 6                    | Data Entry MSB                      | Engine   | Sets the selected RPN or NRPN to the given value. Upper 7 bits. [More info](#parameter-numbers)                                                                                     |
| 7                    | Main Volume                         | SF2      | Changes the channel's volume.                                                                                                                                                       |
| 10                   | Pan                                 | SF2      | Controls the channel's stereo pan.                                                                                                                                                  |
| 11                   | Expression                          | SF2      | Changes the channel's volume, similarly to Main Volume, but independent of it.                                                                                                      |
| 32                   | Bank Select LSB                     | Engine   | Changes the bank number that is used in Program Change. More info: {@link MIDIPatch}                                                                                                |
| 33 - 63 excluding 38 | Controller LSB values               | Engine   | Extends the precision of the corresponding controllers from 7-bit to 14-bit.                                                                                                        |
| 38                   | Data Entry LSB                      | Engine   | Sets the selected RPN or NRPN to the given value. Lower 7 bits. [More info](#parameter-numbers)                                                                                     |
| 64                   | Sustain Pedal                       | Engine   | Holds the Note Off messages until the pedal is off, then stops them all at once.                                                                                                    |
| 65                   | Portamento On/Off                   | Engine   | Controls if the portamento is enabled or not. [More info](#portamento-implementation)                                                                                               |
| 67                   | Soft Pedal                          | Extended | Lowers the low-pass filter cutoff frequency.                                                                                                                                        |
| 71                   | Filter Resonance                    | Extended | Controls the filter resonance of the given patch.                                                                                                                                   |
| 72                   | Release Time                        | Extended | Controls the release time for the given patch.                                                                                                                                      |
| 73                   | Attack Time                         | Extended | Controls the attack time for the given patch.                                                                                                                                       |
| 74                   | Brightness                          | Extended | Controls the brightness (lowpass frequency) of the given patch.                                                                                                                     |
| 75                   | Decay time                          | Extended | Controls the decay time for the given patch.                                                                                                                                        |
| 84                   | Portamento Control                  | Engine   | Controls the portamento target key. Forces portamento once, even if portamento is off. The value persists across channel reset. [More info](#portamento-implementation)             |
| 91                   | Reverb Depth                        | SF2      | Controls the reverb effect send for the given channel. [More info](../extra/modulator-information.md#reverb-and-chorus-modulators)                                                  |
| 93                   | Chorus Depth                        | SF2      | Controls the chorus effect for the given channel. [More info](../extra/modulator-information.md#reverb-and-chorus-modulators)                                                       |
| 94                   | Variation Depth                     | Engine   | In GS mode, it controls the delay effect for the given channel.[^1]                                                                                                                 |
| 98                   | Non-Registered Parameter Number LSB | Engine   | Selects the LSB of the Non-Registered Parameter Number. [More info](#supported-non-registered-parameters)                                                                           |
| 99                   | Non-Registered Parameter Number MSB | Engine   | Selects the MSB of the Non-Registered Parameter Number. [More info](#supported-non-registered-parameters)                                                                           |
| 100                  | Registered Parameter Number LSB     | Engine   | Selects the LSB of the Registered Parameter Number. [More info](#supported-registered-parameters)                                                                                   |
| 101                  | Registered Parameter Number MSB     | Engine   | Selects the MSB of the Registered Parameter Number. [More info](#supported-registered-parameters)                                                                                   |
| 120                  | All Sound Off                       | Engine   | Immediately terminates all active voices, disregarding their release time.                                                                                                          |
| 121                  | Reset All Controllers               | Engine   | Resets controllers to their default values according to the [RP-15 recommended practice.](https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf)                 |
| 123                  | All Notes Off                       | Engine   | Stops all notes, respecting their release time.                                                                                                                                     |
| 124 or 125           | Omni mode On/Off                    | Engine   | Stops all notes, respecting their release time.                                                                                                                                     |
| 126 or 127           | Poly/Mono Mode On/Off               | Engine   | Setting the corresponding controller to any value switches the Poly mode on or off, immediately terminating all active voices on the channel. [More info](#polymono-implementation) |

[^1]: In XG mode `variationSend` is still stored per channel and per drum key, but `delayActive` is forced off, so there is no audible effect.

### Default Controller Values

> **Important**
>
> "Reset All Controllers" (CC#121) is implemented according
> to [RP-15 recommended practice.](https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf)

Below are all the controller values which are not zero when the controllers are reset.

| CC Number | Name                                | Reset Value                              |
| --------- | ----------------------------------- | ---------------------------------------- |
| 0         | Bank Select                         | 121 when the synthesizer is in GM2 mode. |
| 7         | Main Volume                         | 100                                      |
| 8         | Balance                             | 64                                       |
| 11        | Expression                          | 127                                      |
| 10        | Pan                                 | 64                                       |
| 71        | Timbre Harmonic Content             | 64                                       |
| 72        | Release Time                        | 64                                       |
| 73        | Attack Time                         | 64                                       |
| 74        | Brightness                          | 64                                       |
| 75        | Decay Time                          | 64                                       |
| 76        | Vibrato Rate                        | 64                                       |
| 77        | Vibrato Depth                       | 64                                       |
| 78        | Vibrato Delay                       | 64                                       |
| 81        | General Purpose Controller 6        | 64                                       |
| 83        | General Purpose Controller 8        | 64                                       |
| 98        | Non-Registered Parameter Number LSB | 127 (NULL)                               |
| 99        | Non-Registered Parameter Number MSB | 127 (NULL)                               |
| 100       | Registered Parameter Number LSB     | 127 (NULL)                               |
| 101       | Registered Parameter Number MSB     | 127 (NULL)                               |

> **Note**
>
> Reverb is 0 by default, contrary to the MIDI specification as it can introduce unwanted sounds.

### Parameter Numbers

#### Supported Registered Parameters

Below is the list of currently implemented Registered Parameters.

| RPN MSB | RPN LSB | Name                     | Explanation                                                                                                         | Default                      |
| ------- | ------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 0       | 0       | Pitch Wheel Range        | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.pitchWheelRange `pitchWheelRange`}                      | 2 semitones                  |
| 0       | 1       | Channel Fine Tuning      | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.fineTune `fineTune`}                                    | 0 cents                      |
| 0       | 2       | Channel Coarse Tuning    | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.keyShift `keyShift`}                                    | 0 keys                       |
| 0       | 5       | Channel Modulation Depth | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.modulationDepth `modulationDepth`}                      | Default SF2 depth (50 cents) |
| 127     | 127     | Reset parameters         | Resets the selected RPN/NRPN to NULL (unspecified state). All data entries in this state are recognized as ignored. | N.A.                         |

#### Supported Non-Registered Parameters

Below is the list of currently implemented Non-Registered Parameters.

rr: Drum MIDI note number (0 - 127)

| NRPN MSB | NRPN LSB | Name                 | Explanation                                                                                                                       | Default                                                    |
| -------- | -------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 0x01     | 0x08     | Vibrato Rate         | Alias to MIDI CC#76. (Vibrato Rate) Also see [custom vibrato.](#custom-vibrato)                                                   | 64                                                         |
| 0x01     | 0x09     | Vibrato Depth        | Alias to MIDI CC#77. (Vibrato Depth) Also see [custom vibrato.](#custom-vibrato)                                                  | 64                                                         |
| 0x01     | 0x0A     | Vibrato Delay        | Alias to MIDI CC#78. (Vibrato Delay) Also see [custom vibrato.](#custom-vibrato)                                                  | 64                                                         |
| 0x01     | 0x20     | TVF Filter Cutoff    | Alias to MIDI CC#74. (Brightness)                                                                                                 | 64                                                         |
| 0x01     | 0x21     | TVF Filter Resonance | Alias to MIDI CC#71. (Filter resonance)                                                                                           | 64                                                         |
| 0x01     | 0x63     | EG Attack Time       | Alias to MIDI CC#73. (Attack Time)                                                                                                | 64                                                         |
| 0x01     | 0x64     | EG Decay Time        | Alias to MIDI CC#75. (Decay Time)                                                                                                 | 64                                                         |
| 0x01     | 0x66     | EG Release Time      | Alias to MIDI CC#72. (Release Time)                                                                                               | 64                                                         |
| 0x18     | rr       | Drum Pitch           | Controls the pitch of the drum instrument. [More info](#drum-pitch-coarse-implementation)                                         | 0                                                          |
| 0x19     | rr       | Drum Pitch Fine      | Controls the pitch of the drum instrument in cents (XG only)                                                                      | 0                                                          |
| 0x1A     | rr       | Drum Level           | Controls how loud the drum instrument is.                                                                                         | 120 (normal)                                               |
| 0x1C     | rr       | Drum Pan             | Controls the absolute pan position of the drum instrument. 0 is random. 64 leaves the channel pan unchanged (additive of channel) | 64 (no override)                                           |
| 0x1D     | rr       | Drum Reverb          | Controls the reverb level of the drum instrument. (multiplicative of channel)                                                     | 0 for kick drums, otherwise 127.                           |
| 0x1E     | rr       | Drum Chorus          | Controls the chorus level of the drum instrument. (multiplicative of channel)                                                     | 0, or on XG reset: 0 for kick drums, otherwise 127.        |
| 0x1F     | rr       | Drum Variation       | Controls the variation level of the drum instrument.[^7] (multiplicative of channel)                                              | 0 (none), or on XG reset: 0 for kick drums, otherwise 127. |

[^7]: This controls the delay level in GS/GM mode. In XG, it has no effect.

##### Custom Vibrato

> **Note**
>
> This only applies when the {@link GlobalSystemParameter.customVibrato} is enabled.

The NRPN vibrato messages have special behavior.
On synth start and reset it is disabled.
Any value other than 64 received for any of the states activates it with the default settings:

- depth = 50 cents
- rate = 8 Hz
- delay = 0.6s

After which any changes received through the NRPN (including the one that triggered it) are processed.

Calculation for the specific NRPN parameters are as follows (value is the data entry MSB value from 0 to 127):

- Rate: `Hz = (value / 64) * 8`
- Depth: `cents = value / 2`
- Delay: `seconds = value / 64 / 3`

> **Note**
>
> Custom vibrato NRPNs are ignored when the channel has active dynamic modulators
> (for example after GS `*CONTROL` or XG controller-depth messages),
> when {@link ChannelSystemParameter.nrpnParamLock} is set,
> and when the data value is 64 (which leaves the vibrato off).

This behavior has existed since the beginning of this program as a way to enhance Touhou Project MIDI files,
the original target of SpessaSynth.

**It is disabled for any channel that has CC#1 (Mod Wheel) set to anything other than 0.**
This can be useful as setting CC#1 to something like 1 (which is usually imperceptible),
will disable the extra vibrato for this channel when it is globally enabled.

##### SoundFont2 NRPN

As of 3.26.15, SpessaSynth supports the standard SF2 NRPN implementation,
as defined in Section 9.6 of the SoundFont2.04 specification.

##### AWE32 NRPN Compatibility Layer

As of 3.26.11, SpessaSynth supports emulation of the AWE32 NRPN generator modification.
The implementation is similar to FluidSynth's emulation,
as it has been tested and found relatively accurate to the sound cards.
Here are some useful resources about this:

- [AWE32 Frequently Asked Questions](http://archive.gamedev.net/archive/reference/articles/article445.html)
- [AWE32 Developer's Information Pack](https://github.com/user-attachments/files/15757220/adip301.pdf)
- [S. Christian Collins's AWE32 MIDI Conversion Repository](https://github.com/mrbumpy409/AWE32-midi-conversions)
- [S. Christian Collins's AWE32 NRPN Filter Tests](https://github.com/mrbumpy409/SoundFont-Spec-Test/tree/main/NRPN%20test%20-%20filter)
- [FluidSynth AWE32 NRPN implementation](https://www.fluidsynth.org/wiki/FluidFeatures#nrpn-control-change-implementation-chart)

There are a few differences from FluidSynth's implementation:

- LSB 16 overrides the `fineTune` generator instead of emitting a pitch-wheel event.
- Effect generators get overridden directly rather than passing through the modulator.
- Filter cutoff and Q have been tuned slightly differently.

## Supported Bank Selection Systems

See {@link MIDIPatch} for more information.

### GM

General MIDI (Level 1).

Currently equivalent to GS.

### GS

Roland GS, default.

Bank MSB processed directly, LSB is ignored, unless a direct match is found.
System Exclusive messages can be used to turn a channel into a drum channel.

### GM2

General MIDI Level 2.

Bank LSB and MSB are processed.
Default bank MSB is 121 instead of 0.
Bank MSB 120 (GM2 drums) or 127 (XG drums) turns a channel into a drum channel
(126 SFX drums only match by direct preset match).
Drums will be selected according to the [XG Validity Test](#xg-validity-test)

### XG

Yamaha XG.

Bank LSB and MSB are processed.
Bank MSB 120 or 127 turns a channel into a drum channel
(126 SFX drums only match by direct preset match).
Drums will be selected according to the [XG Validity Test](#xg-validity-test)

#### XG Validity Test

Each sound bank is validated for XG compatibility.
That is, contains only allowed program numbers in the XG standard for the drum presets.
This is done because some sound bank set the bank MSB of 127 for Roland MT presets.

If a sound bank fails to meet that check, the synthesizer prefers any available XG drums first,
then any drum preset, falling back to the first preset if no drums exist.
In practice this means the GM/GS drum presets will be used instead when they exist.

## System Exclusives

Below is the list of currently implemented System Exclusive messages.

Jump to the links:

- [Roland GS](#roland-gs)
- [Yamaha XG](#yamaha-xg)
- [Universal MIDI System Exclusive](#universal-midi-system-exclusive)

### Roland GS

SpessaSynth has good support for the GS standard, including effects.
Below are the supported Roland GS messages.

#### Display Data

All messages with address of `0x10 xx xx` are recognized.
A {@link SynthesizerEvent.displayMessage | `displayMessage`} event will be emitted with the System Exclusive data.

#### System Parameters

These are global parameters, affecting the entire synthesizer.
There's only one supported message in this category.

##### System Mode Set (SC-88+ Reset)

Resets the synthesizer and sets the `system` Global MIDI Parameter to `gs`.

Note that value `01` is defined as `Double Module Mode` and makes the synthesizer ensure that it has at least 32 channels.

#### Patch Common Parameters

These are global parameters, affecting the entire synthesizer.

##### System

| Name             | Description                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MASTER TUNE      | Sets the Global MIDI Parameter {@link GlobalMIDIParameter.fineTune `fineTune`}.                                                                                                                   |
| MASTER VOLUME    | Sets the Global MIDI Parameter {@link GlobalMIDIParameter.volume `volume`}.                                                                                                                       |
| MASTER KEY-SHIFT | Sets the Global MIDI Parameter {@link GlobalMIDIParameter.keyShift `keyShift`}.                                                                                                                   |
| MASTER PAN       | Sets the Global MIDI Parameter {@link GlobalMIDIParameter.pan `pan`}.                                                                                                                             |
| MODE SET         | Resets the synthesizer and sets the Global MIDI Parameter {@link GlobalMIDIParameter.system `system`} to `gs`.                                                                                    |
| PATCH NAME       | Treated as recognized, decoded name is logged to console if verbose output is enabled. A {@link SynthesizerEvent.displayMessage `displayMessage`} will be emitted with the System Exclusive data. |

##### Reverb

| Name                  | Description                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REVERB MACRO          | Sets all Reverb Processor parameters to a predefined value. All GS macros are supported. Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf), page 81. |
| REVERB CHARACTER      | Sets the Reverb Processor property {@link ReverbProcessor.character `character`}.                                                                                                            |
| REVERB PRE-LPF        | Sets the Reverb Processor property {@link ReverbProcessor.preLowpass `preLowpass`}.                                                                                                          |
| REVERB LEVEL          | Sets the Reverb Processor property {@link ReverbProcessor.level `level`}.                                                                                                                    |
| REVERB TIME           | Sets the Reverb Processor property {@link ReverbProcessor.time `time`}.                                                                                                                      |
| REVERB DELAY FEEDBACK | Sets the Reverb Processor property {@link ReverbProcessor.delayFeedback `delayFeedback`}.                                                                                                    |
| REVERB PREDELAY TIME  | Sets the Reverb Processor property {@link ReverbProcessor.preDelayTime `preDelayTime`}.                                                                                                      |

##### Chorus

| Name                        | Description                                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CHORUS MACRO                | Sets all Chorus Processor parameters to a predefined value. All GS macros are supported. Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf), page 83. |
| CHORUS PRE-LPF              | Sets the Chorus Processor property {@link ChorusProcessor.preLowpass `preLowpass`}.                                                                                                          |
| CHORUS LEVEL                | Sets the Chorus Processor property {@link ChorusProcessor.level `level`}.                                                                                                                    |
| CHORUS FEEDBACK             | Sets the Chorus Processor property {@link ChorusProcessor.feedback `feedback`}.                                                                                                              |
| CHORUS DELAY                | Sets the Chorus Processor property {@link ChorusProcessor.delay `delay`}.                                                                                                                    |
| CHORUS RATE                 | Sets the Chorus Processor property {@link ChorusProcessor.rate `rate`}.                                                                                                                      |
| CHORUS DEPTH                | Sets the Chorus Processor property {@link ChorusProcessor.depth `depth`}.                                                                                                                    |
| CHORUS SEND LEVEL TO REVERB | Sets the Chorus Processor property {@link ChorusProcessor.sendLevelToReverb `sendLevelToReverb`}.                                                                                            |
| CHORUS SEND LEVEL TO DELAY  | Sets the Chorus Processor property {@link ChorusProcessor.sendLevelToDelay `sendLevelToDelay`}.                                                                                              |

##### Delay

| Name                       | Description                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DELAY MACRO                | Sets all Delay Processor parameters to a predefined value. All GS macros are supported. Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf), page 85. |
| DELAY PRE-LPF              | Sets the Delay Processor property {@link DelayProcessor.preLowpass `preLowpass`}.                                                                                                           |
| DELAY TIME CENTER          | Sets the Delay Processor property {@link DelayProcessor.timeCenter `timeCenter`}.                                                                                                           |
| DELAY TIME RATIO LEFT      | Sets the Delay Processor property {@link DelayProcessor.timeRatioLeft `timeRatioLeft`}.                                                                                                     |
| DELAY TIME RATIO RIGHT     | Sets the Delay Processor property {@link DelayProcessor.timeRatioRight `timeRatioRight`}.                                                                                                   |
| DELAY LEVEL CENTER         | Sets the Delay Processor property {@link DelayProcessor.levelCenter `levelCenter`}.                                                                                                         |
| DELAY LEVEL LEFT           | Sets the Delay Processor property {@link DelayProcessor.levelLeft `levelLeft`}.                                                                                                             |
| DELAY LEVEL RIGHT          | Sets the Delay Processor property {@link DelayProcessor.levelRight `levelRight`}.                                                                                                           |
| DELAY LEVEL                | Sets the Delay Processor property {@link DelayProcessor.level `level`}.                                                                                                                     |
| DELAY FEEDBACK             | Sets the Delay Processor property {@link DelayProcessor.feedback `feedback`}.                                                                                                               |
| DELAY SEND LEVEL TO REVERB | Sets the Delay Processor property {@link DelayProcessor.sendLevelToReverb `sendLevelToReverb`}.                                                                                             |

##### EFX

| Name                     | Description                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| EFX TYPE                 | Sets the type of the insertion effect. See [supported insertion effects](#currently-implemented-insertion-effects). |
| EFX PARAMETER 1-20       | Sets the parameters of the insertion effect.                                                                        |
| EFX SEND LEVEL TO REVERB | Sets the amount of signal sent from the insertion effect to the reverb effect.                                      |
| EFX SEND LEVEL TO CHORUS | Sets the amount of signal sent from the insertion effect to the chorus effect.                                      |
| EFX SEND LEVEL TO DELAY  | Sets the amount of signal sent from the insertion effect to the delay effect.                                       |

#### Patch Part Parameters

Part (channel) parameters set a specific parameter for a specific channel.

> **Warning**
>
> GS can refer up to 32 channels, the top 16 can be accessed with `0x50` instead of `0x40` for the "BLOCK B".
>
> Parts above the current channel count are discarded. To avoid this, add more channels to the synthesizer.

| Name                              | Description                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| TONE NUMBER                       | Bank MSB and Program Change in one message.                                                                                                 |
| Rx. CHANNEL                       | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.rxChannel `rxChannel`}.                                                         |
| MONO/POLY MODE                    | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.polyMode `polyMode`}. See [poly/mono implementation](#polymono-implementation). |
| ASSIGN MODE                       | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.assignMode `assignMode`}.                                                       |
| USE FOR RHYTHM PART               | Turns any channel into (or back out of) a drum channel.[^2]                                                                                 |
| PITCH KEY SHIFT                   | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.keyShift `keyShift`}.                                                           |
| PART LEVEL                        | Aliased to MIDI CC#7 (Main Volume).                                                                                                         |
| VELOCITY SENSE DEPTH              | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.velocitySenseDepth `velocitySenseDepth`}.                                       |
| VELOCITY SENSE OFFSET             | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.velocitySenseOffset `velocitySenseOffset`}.                                     |
| PART PANPOT                       | Aliased to MIDI CC#10 (Pan), except value `0` enables random pan for every new voice on that channel.                                       |
| CC1 CONTROLLER NUMBER             | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.cc1 `cc1`}.                                                                     |
| CC2 CONTROLLER NUMBER             | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.cc2 `cc2`}.                                                                     |
| CHORUS SEND LEVEL                 | Aliased to MIDI CC#93 (Chorus Depth).                                                                                                       |
| REVERB SEND LEVEL                 | Aliased to MIDI CC#91 (Reverb Depth).                                                                                                       |
| PITCH FINE TUNE                   | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.fineTune `fineTune`}.                                                           |
| DELAY SEND LEVEL                  | Aliased to MIDI CC#94 (Variation Depth).                                                                                                    |
| TONE MODIFY1 (Vibrato rate)       | Aliased to MIDI CC#76 (Vibrato Rate).                                                                                                       |
| TONE MODIFY2 (Vibrato depth)      | Aliased to MIDI CC#77 (Vibrato Depth).                                                                                                      |
| TONE MODIFY3 (TVF Cutoff Freq)    | Aliased to MIDI CC#74 (Brightness).                                                                                                         |
| TONE MODIFY4 (TVF Resonance)      | Aliased to MIDI CC#71 (Filter Resonance).                                                                                                   |
| TONE MODIFY5 (TVF&TVA Env.attack) | Aliased to MIDI CC#73 (Attack Time).                                                                                                        |
| TONE MODIFY6 (TVF&TVA Env.decay)  | Aliased to MIDI CC#75 (Decay Time).                                                                                                         |
| TONE MODIFY7 (TVA Env.release)    | Aliased to MIDI CC#72 (Release Time).                                                                                                       |
| TONE MODIFY8 (Vibrato delay)      | Aliased to MIDI CC#78 (Vibrato Delay).                                                                                                      |
| SCALE TUNING                      | Treated like MTS octave tuning, allows to tune an octave in cents. Tuning is repeated for all octaves.                                      |
| \* CONTROL                        | See [Patch Part Parameters (Controllers)](#patch-part-parameters-controllers) for more details.                                             |
| TONE MAP NUMBER                   | Aliased to MIDI CC#32 (Bank Select LSB).                                                                                                    |
| TONE MAP-0 NUMBER                 | Aliased to MIDI CC#32 (Bank Select LSB).                                                                                                    |
| PART EFX ASSIGN                   | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.efxAssign `efxAssign`}.                                                         |

[^2]: Unlike with Sound Canvases, there's no limit to drum channels the synthesizer can have. The Drum Map number is stored in Channel MIDI Parameter {@link ChannelMIDIParameter.drumMap `drumMap`}. Switching resets the bank to 0 and the program to 0 and changing the drum map number re-selects the kit the same way.

#### Patch Part Parameters (Controllers)

All of them are supported! At least, in theory.
These define how a controller affects the sound.
See page 198 of the SC-88Pro Manual.
This is implemented using a dynamic modulator system and additional generators to cover the linear time and hertz range.

There are two special cases that are directly aliased to Channel MIDI Parameters:

- MOD LFO1 PITCH DEPTH - Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.modulationDepth `modulationDepth`}.
- BEND PITCH CONTROL - Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.pitchWheelRange `pitchWheelRange`}.

#### Drum Setup Parameters

The following messages allow to tune drum instruments.
A drum instrument is defined as a single MIDI key in the drum preset.
These search for a matching drum channel with the correct `drumMap` Channel MIDI Parameter.

| Name                | Description                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DRUM MAP NAME       | Treated as recognized, decoded name is logged to console if verbose output is enabled. A {@link SynthesizerEvent.displayMessage `displayMessage`} event will be emitted with the System Exclusive data. |
| PLAY NOTE NUMBER    | Relative pitch tuning of the instrument. [More info](#drum-pitch-coarse-implementation)                                                                                                                 |
| LEVEL               | The drum's loudness. Normalized against 120 as `gain = (data / 120) ^ 2`.                                                                                                                               |
| ASSIGN GROUP NUMBER | This overrides the `exclusiveClass` generator, allowing to define custom exclusive notes.                                                                                                               |
| PANPOT              | Pan position of the instrument, except value `0` enables random panning for every note. Value `64` leaves the channel pan unchanged (additive of channel).                                              |
| REVERB SEND LEVEL   | Reverb send level of the instrument. (multiplicative of channel)                                                                                                                                        |
| CHORUS SEND LEVEL   | Chorus send level of the instrument. (multiplicative of channel)                                                                                                                                        |
| Rx. NOTE OFF        | Enabling this (as it is disabled by default) forces the drum instrument to immediately terminate when it receives a Note Off.                                                                           |
| Rx. NOTE ON         | This allows to disable a specific drum instrument from receiving Note On events.                                                                                                                        |
| DELAY SEND LEVEL    | Delay send level of the instrument. (multiplicative of channel)                                                                                                                                         |

#### User Drum set

The following messages allow to create a custom drum instrument, by setting which key from which drum set is bound to a specific key in the user drum set.
Then the parameters above may also be applied to the key.
Instruments are available on programs 64 and 65 in GS mode.

| Name                   | Description                                                                                                                                                | Parameter Name     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| USER DRUM MAP NAME     | Exactly the same behavior as DRUM MAP NAME.                                                                                                                | N.A.               |
| PLAY NOTE NUMBER       | Relative pitch tuning of the instrument. [More info](#drum-pitch-coarse-implementation)                                                                    | `pitchCoarse`      |
| LEVEL                  | The drum's loudness. Normalized against 120 as `gain = (data / 120) ^ 2`.                                                                                  | `level`            |
| ASSIGN GROUP NUMBER    | This overrides the `exclusiveClass` generator, allowing to define custom exclusive notes.                                                                  | `assignGroup`      |
| PANPOT                 | Pan position of the instrument, except value `0` enables random panning for every note. Value `64` leaves the channel pan unchanged (additive of channel). | `pan`              |
| REVERB SEND LEVEL      | Reverb send level of the instrument. (multiplicative of channel)                                                                                           | `reverbSend`       |
| CHORUS SEND LEVEL      | Chorus send level of the instrument. (multiplicative of channel)                                                                                           | `chorusSend`       |
| Rx. NOTE OFF           | Enabling this (as it is disabled by default) forces the drum instrument to immediately terminate when it receives a Note Off.                              | `rxNoteOff`        |
| Rx. NOTE ON            | This allows to disable a specific drum instrument from receiving Note On events.                                                                           | `rxNoteOn`         |
| DELAY SEND LEVEL       | Delay send level of the instrument. (multiplicative of channel)                                                                                            | `variationSend`    |
| SOURCE DRUM SET# (MAP) | Bank LSB number of the source drum set for this key. (GS map)                                                                                              | `sourceDrumSet`    |
| (PG#: Program number)  | The program number of the source drum set for this key.                                                                                                    | `program`          |
| SOURCE NOTE NUMBER     | The MIDI note number of the source drum set for this key.                                                                                                  | `sourceNoteNumber` |

#### Bulk Dump

Bulk dump messages allow to set many parameters in one message.

SpessaSynth currently recognizes the bulk dump messages for User Drum Set only.

### Yamaha XG

SpessaSynth has decent support for the XG standard, but it does not include any effects.
Below are the supported Yamaha XG System Exclusive messages.

#### System parameters

These are global parameters, affecting the entire synthesizer.

| Name                | Description                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| MASTER TUNE         | Sets the Global MIDI Parameter {@link GlobalMIDIParameter.fineTune `fineTune`}.                                |
| MASTER VOLUME       | Sets the Global MIDI Parameter {@link GlobalMIDIParameter.volume `volume`}.                                    |
| MASTER ATTENUATOR   | Sets the Global MIDI Parameter {@link GlobalMIDIParameter.volume `volume`} with an inverted value.             |
| MASTER TRANSPOSE    | Sets the Global MIDI Parameter {@link GlobalMIDIParameter.keyShift `keyShift`}                                 |
| XG SYSTEM ON        | Resets the synthesizer and sets the Global MIDI Parameter {@link GlobalMIDIParameter.system `system`} to `xg`. |
| ALL PARAMETER RESET | Resets the synthesizer and sets the Global MIDI Parameter {@link GlobalMIDIParameter.system `system`} to `xg`. |

#### Reverb, chorus, and variation block

Reverb, chorus, and variation parameter addresses are _not supported (yet)_.
They are ignored and logged to console in verbose output.

#### Part Setup

Part (channel) parameters set a specific parameter for a specific channel.

> **Warning**
>
> XG part (channel) number may range from 0 to 64.
>
> Parts above the current channel count are discarded. To avoid this, add more channels to the synthesizer.

| Name                           | Description                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| BANK SELECT MSB                | Aliased to MIDI CC#0 (Bank Select).                                                                                                         |
| BANK SELECT LSB                | Aliased to MIDI CC#32 (Bank Select LSB).                                                                                                    |
| PROGRAM CHANGE                 | Same as a MIDI Program Change on that part's channel.                                                                                       |
| RECEIVE CHANNEL NUMBER         | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.rxChannel `rxChannel`}.                                                         |
| POLY/MONO MODE                 | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.polyMode `polyMode`}. See [poly/mono implementation](#polymono-implementation). |
| SAME NOTE NUMBER KEY ON ASSIGN | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.assignMode `assignMode`}.                                                       |
| PART MODE                      | `0` = normal (melodic) part; any non-zero value turns the part into a drum channel.[^3]                                                     |
| NOTE SHIFT                     | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.keyShift `keyShift`}.                                                           |
| VOLUME                         | Aliased to MIDI CC#7 (Main Volume).                                                                                                         |
| VELOCITY SENSE DEPTH           | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.velocitySenseDepth `velocitySenseDepth`}.                                       |
| VELOCITY SENSE OFFSET          | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.velocitySenseOffset `velocitySenseOffset`}.                                     |
| PAN                            | Aliased to MIDI CC#10 (Pan), except value `0` enables random pan for every new voice on that channel.                                       |
| CHORUS                         | Aliased to MIDI CC#93 (Chorus Depth).                                                                                                       |
| REVERB                         | Aliased to MIDI CC#91 (Reverb Depth).                                                                                                       |
| VIBRATO RATE                   | Aliased to MIDI CC#76 (Vibrato Rate).                                                                                                       |
| VIBRATO DEPTH                  | Aliased to MIDI CC#77 (Vibrato Depth).                                                                                                      |
| VIBRATO DELAY                  | Aliased to MIDI CC#78 (Vibrato Delay).                                                                                                      |
| FILTER CUTOFF                  | Aliased to MIDI CC#74 (Brightness).                                                                                                         |
| FILTER RESONANCE               | Aliased to MIDI CC#71 (Filter Resonance).                                                                                                   |
| EG ATTACK TIME                 | Aliased to MIDI CC#73 (Attack Time).                                                                                                        |
| EG DECAY TIME                  | Aliased to MIDI CC#75 (Decay Time).                                                                                                         |
| EG RELEASE TIME                | Aliased to MIDI CC#72 (Release Time).                                                                                                       |
| AC1 CONTROLLER NUMBER          | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.cc1 `cc1`}.                                                                     |
| AC2 CONTROLLER NUMBER          | Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.cc2 `cc2`}.                                                                     |
| PORTAMENTO SWITCH              | Aliased to MIDI CC#65 (Portamento On/Off), as a switch. ON is 127, OFF is 0.                                                                |
| PORTAMENTO TIME                | Aliased to MIDI CC#5 (Portamento Time).                                                                                                     |

[^3]: In XG, the conventional drum channel (9 within each 16-channel group) cannot be switched back to melodic mode. Switching to drums re-initializes the kit, resetting the program to 0, while switching back to melodic keeps the program.

#### Patch Part Controller Depths

All of them are supported! At least, in theory (excluding HPF which is marked as `(NOT USED)`)
These define how a controller affects the sound.
Examples:

- MW PITCH CONTROL
- MW FILTER CONTROL
- PAT AMPLITUDE CONTROL
- AC2 LFO AMOD DEPTH

See pages 42 and 43 of the XG specification.
This is implemented using a dynamic modulator system and additional generators to cover the linear amplitude range.

There are two special cases that are directly aliased to Channel MIDI Parameters:

- MW LFO PMOD DEPTH - Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.modulationDepth `modulationDepth`}.
- BEND PITCH CONTROL - Sets the Channel MIDI Parameter {@link ChannelMIDIParameter.pitchWheelRange `pitchWheelRange`}.

#### Drum Setup

The following messages allow to tune drum instruments.
A drum instrument is defined as a single MIDI key in the drum preset.

Edits are applied to _every drum channel_: for each note/key,
all drum channels get the same stored parameters, as there isn't a MAP system, like in GS.

| Name            | Description                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PITCH COARSE    | Relative pitch tuning of the instrument. [More info](#drum-pitch-coarse-implementation)                                                                    |
| PITCH FINE      | Cent tuning for the drum instrument.                                                                                                                       |
| LEVEL           | Normalizes loudness as `gain = (data / 120) ^ 2`.                                                                                                          |
| ALTERNATE GROUP | Overrides the `exclusiveClass` generator for that drum instrument.                                                                                         |
| PAN             | Pan position of the instrument, except value `0` enables random panning for every note. Value `64` leaves the channel pan unchanged (additive of channel). |
| REVERB SEND     | Reverb send level of the instrument. (multiplicative of channel)                                                                                           |
| CHORUS SEND     | Chorus send level of the instrument. (multiplicative of channel)                                                                                           |
| VARIATION SEND  | Variation send level of the instrument.[^4] (multiplicative of channel)                                                                                    |
| Rev NOTE OFF    | Enabling this (as it is disabled by default) forces the drum instrument to immediately terminate when it receives a Note Off.                              |
| Rev NOTE ON     | This allows to disable a specific drum instrument from receiving Note On events.                                                                           |

[^4]: XG Variation is not yet implemented.

#### Display Data

| Name           | Description                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display Letter | The text that XG MIDIs display on the device. A {@link SynthesizerEvent.displayMessage `displayMessage`} event will be emitted with the System Exclusive data. |
| Display Bitmap | Dot matrix display data for the XG devices. A {@link SynthesizerEvent.displayMessage `displayMessage`} event will be emitted with the System Exclusive data.   |

### Universal MIDI System Exclusive

SpessaSynth has decent support for the Universal MIDI System Exclusives, including General MIDI 2 and Device Control messages.
Below are the supported Universal System Exclusive messages.

#### Device Control

| Name                 | Description                                                                     |
| -------------------- | ------------------------------------------------------------------------------- |
| Master Volume        | Sets the Global MIDI Parameter {@link GlobalMIDIParameter.volume `volume`}.     |
| Master Balance       | Sets the Global MIDI Parameter {@link GlobalMIDIParameter.pan `pan`}.           |
| Master Fine-Tuning   | Sets the Global MIDI Parameter {@link GlobalMIDIParameter.fineTune `fineTune`}. |
| Master Coarse Tuning | Sets the Global MIDI Parameter {@link GlobalMIDIParameter.keyShift `keyShift`}. |

#### Global Parameter Control

| Name           | Description                                                                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reverb Type    | Sets all Reverb Processor parameters to a predefined value. All GS macros are supported. Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf), page 81. |
| Reverb Time    | Sets the Reverb Processor property {@link ReverbProcessor.time `time`}.                                                                                                                      |
| Chorus Type    | Sets all Chorus Processor parameters to a predefined value. All GS macros are supported. Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf), page 83. |
| Mod Rate       | Sets the Chorus Processor property {@link ChorusProcessor.rate `rate`}.                                                                                                                      |
| Mod Depth      | Sets the Chorus Processor property {@link ChorusProcessor.depth `depth`}.                                                                                                                    |
| Feedback       | Sets the Chorus Processor property {@link ChorusProcessor.feedback `feedback`}.                                                                                                              |
| Send to Reverb | Sets the Chorus Processor property {@link ChorusProcessor.sendLevelToReverb `sendLevelToReverb`}.                                                                                            |

#### General MIDI

| Name          | Description                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| GM System Off | Resets the synthesizer and sets the Global MIDI Parameter {@link GlobalMIDIParameter.system `system`} to `gs`.  |
| GM1 System On | Resets the synthesizer and sets the Global MIDI Parameter {@link GlobalMIDIParameter.system `system`} to `gm`.  |
| GM2 System On | Resets the synthesizer and sets the Global MIDI Parameter {@link GlobalMIDIParameter.system `system`} to `gm2`. |

#### MIDI Tuning Standard

Below are the supported messages for the MTS.
Both non-realtime and realtime are treated as realtime.

| Name                          | Description                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| Bulk Tuning Dump              | Tuning dump for all 128 notes.                                |
| Scale Octave Tuning (1 byte)  | Tunes an octave in cents. Tuning is repeated for all octaves. |
| Scale Octave Tuning (2 bytes) | Tunes an octave in cents. Tuning is repeated for all octaves. |
| Single Note Tuning Change     | Tunes a single note.[^5]                                      |

[^5]: Note that this can theoretically be used as per-note Pitch Wheel.

## Implementation Details

### Overlapping Notes

As of 4.3.6 SpessaSynth supports overlapping MIDI notes (for example two consecutive Note On messages and two Note Off messages after),
matching the behavior of Sound Canvases and XG synthesizers.
Although overlapping notes are not technically permitted by the MIDI standard, some files [use them anyway](https://github.com/spessasus/spessasynth_core/issues/13).

The implementation is FIFO - First In, First Out.
The first voice that started playing on the note will be stopped upon receiving the Note Off.
This behavior is tracked independently per channel.

The following example describes the behavior:

1. Program Change to 80 - Square Wave.
2. Note On 60, Square Wave starts playing.
3. Program Change to 81 - Saw Wave.
4. Note On 60, Saw Wave starts playing on top of Square Wave.
5. Note Off 60, Square Wave stops playing, only Saw Wave sounds.
6. Note Off 60, Saw Wave stops playing.

### Poly/Mono Implementation

SpessaSynth's poly/mono mode implementation works like the GS implementation.
This is regardless of the current MIDI system.

#### Poly Mode

Poly Mode is regular playback, multiple notes are allowed on the channel.
It is the default mode on all channels.

#### Mono Mode

Mono Mode allows only a single note on the channel.
A Note On for a different pitch will immediately terminate the previously tracked mono note.
Releasing a note while another one is held will retrigger the highest currently held note,
with the velocity of the last Note On.

### Portamento Implementation

SpessaSynth attempts to recreate the old Sound Canvas/Yamaha XG portamento behavior.

That is:

- Portamento Time is only 7-bit. (only CC#5 is processed)
- Setting Portamento Control (CC#84) overrides the current from key and forces portamento on the next Note On that can apply portamento, regardless of CC#65 (Portamento On/Off) being enabled.
- If Portamento is on (CC#65 >= 64), the note glides from the previous note.
- For XG, the initial key to glide from is 60, for other systems there's no initial glide.
- Portamento is applied only when the channel is not a drum channel, the previous note is valid (`>= 0`), differs from the new note, and the portamento time is non-zero.
- Portamento Time depends on the distance of the keys. The rate is constant so the time scales linearly with distance.
  The final calculation is `portamentoSeconds = portamentoTimeToSeconds(cc5, keyDistance)`.
- The details of the `portamentoTimeToSeconds` / `portaTimeToRate` function [can be found here.](https://github.com/spessasus/spessasynth_core/blob/master/src/synthesizer/audio_engine/channel/portamento_time.ts)

> **Tip**
>
> If you know a more accurate algorithm, please let me know!

### Drum Pitch Coarse Implementation

Relative pitch tuning of the drum instrument has special handling.
Precision depends on the mode:

For XG: The drum tuning resolution is 100 cents, i.e. a semitone.

For GS: It depends on the bank LSB number (MSB and drum map are ignored for this detection):

- Bank LSB value of 1 indicates an SC-55 preset, the resolution is 100 cents, i.e. a semitone
- Any other value is treated as SC-88 or higher, where the resolution (for whatever reason) is 50 cents.

> **Note**
>
> NRPN drum pitch uses base 64 (`pitch = data - 64`), while GS SysEx `PLAY NOTE NUMBER` uses base 60.

## System Effects

SpessaSynth's effects are modeled after the Sound Canvas line.
There are currently 3 effect processors, below are their built-in, default implementations.

Note that all three can be replaced with custom effect processors.

### Reverb

Characters 0-5 use the Dattorro reverb model, based on [this processor](https://github.com/khoin/DattorroReverbNode).
Each of the characters has parameters tuned to match the SC-55 effects more closely.
The built-in pre-lowpass filter is used for the pre-LPF param.

Character 6 uses a single delay line while character 7 uses a ping-pong delay.
A simple 1st order lowpass filter is used for the pre-LPF param.

### Chorus

Implemented using 2 delay lines modulated by triangle LFOs.
A simple 1st order lowpass filter is used for the pre-LPF param.

### Delay

Implemented using a single shared circular buffer with three read indexes (center, left, right),
with the central tap having feedback and feeding into the stereo taps.
Input is fed to all three taps.

Disabled in XG mode as CC#94 (used as delay send level) is used for Variation which is not implemented.

## Insertion Effects

SpessaSynth has an architecture in place to support SC-88Pro+ insertion effects.

### Currently implemented insertion effects

- Stereo-EQ
- Phaser
- Auto Pan
- Auto Wah (needs improvements)
- Tremolo
- PH + Auto Wah
