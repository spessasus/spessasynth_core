# MIDI Implementation

This page describes what messages [`SpessaSynthProcessor`](../spessa-synth-processor/index.md) can receive.
The supported standards are:

- MIDI 1.0 Protocol
- General MIDI Level 1
- General MIDI Level 2
- Roland GS
- Yamaha XG.

!!! Tip

    [Here is a useful resource about the MIDI standard. It's in japanese, but all the PDFs are english.](https://amei.or.jp/midistandardcommittee/RP&CAj.html)

## Supported MIDI Messages

Below is the list of supported MIDI messages.

| Message           | Supported? | Notes                                                                                                                   |
| ----------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Note On           | ✔️         | [More info](#overlapping-notes)                                                                                         |
| Note Off          | ✔️         | Does not support note off velocity (Per SF2 specification) [More info](#overlapping-notes)                              |
| Poly Pressure     | ✔️         | Recognized, but no default behavior (Per SF2 specification). It has to be defined with modulators or System Exclusives. |
| Controller Change | ✔️         | [More info](#default-supported-controllers)                                                                             |
| Program Change    | ✔️         | [More info](../spessa-synth-processor/midi-patch.md).                                                                   |
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

!!! Note

    This is API-only, there are no MIDI messages that allow for changing it for now.

## Controllers

### Default Supported Controllers

Below is the list of controllers supported by default.

!!! Note

    Any MIDI CC may affect synthesis through modulators,
    but the controllers below have built-in behavior or default modulators.

Legend for the "Type" column:

- SF2 - Support for this controller is provided by an SF2 default modulator, can be disabled via DMOD.
- Extended - Support for this controller is provided by a non-SF2 default modulator, can be disabled via DMOD.
- Engine - Support for this controller is provided with a custom behavior, _cannot_ be disabled via DMOD.

!!! Note

    For exact values of the modulators, see [default modulators](../sound-bank/modulator.md#default-modulators)

| CC#                  | Controller Name                     | Type     | Behavior                                                                                                                                                            |
| -------------------- | ----------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0                    | Bank Select                         | Engine   | Changes the bank number that is used in Program Change. [More info](../spessa-synth-processor/midi-patch.md)                                                        |
| 1                    | Modulation Wheel                    | SF2      | Controls the vibrato for the given patch.                                                                                                                           |
| 5                    | Portamento Time                     | Engine   | Controls the portamento time. [More info](#portamento-implementation)                                                                                               |
| 6                    | Data Entry MSB                      | Engine   | Sets the selected RPN or NRPN to the given value. Upper 7 bits. [More info](#parameter-numbers)                                                                     |
| 7                    | Main Volume                         | SF2      | Changes the channel's volume.                                                                                                                                       |
| 10                   | Pan                                 | SF2      | Controls the channel's stereo pan.                                                                                                                                  |
| 11                   | Expression                          | SF2      | Changes the channel's volume, similarly to Main Volume, but independent of it.                                                                                      |
| 32                   | Bank Select LSB                     | Engine   | Changes the bank number that is used in Program Change. [More info](../spessa-synth-processor/midi-patch.md)                                                        |
| 33 - 63 excluding 38 | Controller LSB values               | SF2      | Extends the precision of the corresponding controllers from 7-bit to 14-bit.                                                                                        |
| 38                   | Data Entry LSB                      | Engine   | Sets the selected RPN or NRPN to the given value. Lower 7 bits. [More info](#parameter-numbers)                                                                     |
| 64                   | Sustain Pedal                       | Engine   | Holds the Note Off messages until the pedal is off, then stops them all at once.                                                                                    |
| 65                   | Portamento On/Off                   | Engine   | Controls if the portamento is enabled or not. [More info](#portamento-implementation)                                                                               |
| 67                   | Soft Pedal                          | Extended | Lowers the low-pass filter cutoff frequency.                                                                                                                        |
| 71                   | Filter Resonance                    | Extended | Controls the filter resonance of the given patch.                                                                                                                   |
| 72                   | Release Time                        | Extended | Controls the release time for the given patch.                                                                                                                      |
| 73                   | Attack Time                         | Extended | Controls the attack time for the given patch.                                                                                                                       |
| 74                   | Brightness                          | Extended | Controls the brightness (lowpass frequency) of the given patch.                                                                                                     |
| 75                   | Decay time                          | Extended | Controls the decay time for the given patch.                                                                                                                        |
| 84                   | Portamento Control                  | Engine   | Controls the portamento target key. [More info](#portamento-implementation)                                                                                         |
| 91                   | Reverb Depth                        | SF2      | Controls the reverb effect send for the given channel. [More info](../sound-bank/modulator.md#reverb-and-chorus-modulators)                                         |
| 93                   | Chorus Depth                        | SF2      | Controls the chorus effect for the given channel. [More info](../sound-bank/modulator.md#reverb-and-chorus-modulators)                                              |
| 94                   | Variation Depth                     | Engine   | In GS mode, it controls the delay effect for the given channel.[^1]                                                                                                 |
| 98                   | Non-Registered Parameter Number LSB | Engine   | Selects the LSB of the Non-Registered Parameter Number. [More info](#supported-non-registered-parameters)                                                           |
| 99                   | Non-Registered Parameter Number MSB | Engine   | Selects the MSB of the Non-Registered Parameter Number. [More info](#supported-non-registered-parameters)                                                           |
| 100                  | Registered Parameter Number LSB     | Engine   | Selects the LSB of the Registered Parameter Number. [More info](#supported-registered-parameters)                                                                   |
| 101                  | Registered Parameter Number MSB     | Engine   | Selects the MSB of the Registered Parameter Number. [More info](#supported-registered-parameters)                                                                   |
| 120                  | All Sound Off                       | Engine   | Immediately terminates all active voices, disregarding their release time.                                                                                          |
| 121                  | Reset All Controllers               | Engine   | Resets controllers to their default values according to the [RP-15 recommended practice.](https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf) |
| 123                  | All Notes Off                       | Engine   | Stops all notes, respecting their release time.                                                                                                                     |
| 124 or 125           | Omni mode On/Off                    | Engine   | Stops all notes, respecting their release time.                                                                                                                     |
| 126 or 127           | Poly/Mono Mode On/Off               | Engine   | Setting the corresponding controller to any value switches the Poly mode on or off. [More info](#polymono-implementation)                                           |

[^1]: XG Variation is not yet implemented.

### Default Controller Values

!!! Important

    "Reset All Controllers" (CC#121) is implemented according
    to [RP-15 recommended practice.](https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf)

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

!!! Note

    Reverb is 0 by default, contrary to the MIDI specification as it can introduce unwanted sounds.

### Parameter Numbers

#### Supported Registered Parameters

Below is the list of currently implemented Registered Parameters.

| RPN MSB | RPN LSB | Name                     | Explanation                                                                                                                       | Default                      |
| ------- | ------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 0       | 0       | Pitch Wheel Range        | Sets the Channel MIDI Parameter [`pitchWheelRange`](../spessa-synth-processor/midi-channel/channel-parameters.md#pitchwheelrange) | 2 semitones                  |
| 0       | 2       | Channel Coarse Tuning    | Sets the Channel MIDI Parameter [`keyShift`](../spessa-synth-processor/midi-channel/channel-parameters.md#keyshift_1)             | 0 keys                       |
| 0       | 3       | Channel Fine Tuning      | Sets the Channel MIDI Parameter [`fineTune`](../spessa-synth-processor/midi-channel/channel-parameters.md#finetune_1)             | 0 cents                      |
| 0       | 5       | Channel Modulation Depth | Sets the Channel MIDI Parameter [`modulationDepth`](../spessa-synth-processor/midi-channel/channel-parameters.md#modulationdepth) | Default SF2 depth (50 cents) |
| 127     | 127     | Reset parameters         | Resets the selected RPN/NRPN to NULL (unspecified state). All data entries in this state are recognized as ignored.               | N.A.                         |

#### Supported Non-Registered Parameters

Below is the list of currently implemented Non-Registered Parameters.

rr: Drum MIDI note number (0 - 127)

| NRPN MSB | NRPN LSB | Name                 | Explanation                                                                                         | Default                          |
| -------- | -------- | -------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------- |
| 0x01     | 0x08     | Vibrato Rate         | Alias to MIDI CC#76. (Vibrato Rate)                                                                 | 64                               |
| 0x01     | 0x09     | Vibrato Depth        | Alias to MIDI CC#77. (Vibrato Depth)                                                                | 64                               |
| 0x01     | 0x0A     | Vibrato Delay        | Alias to MIDI CC#78. (Vibrato Delay)                                                                | 64                               |
| 0x01     | 0x20     | TVF Filter Cutoff    | Alias to MIDI CC#74. (Brightness)                                                                   | 64                               |
| 0x01     | 0x21     | TVF Filter Resonance | Alias to MIDI CC#71. (Filter resonance)                                                             | 64                               |
| 0x01     | 0x63     | EG Attack Time       | Alias to MIDI CC#73. (Attack Time)                                                                  | 64                               |
| 0x01     | 0x64     | EG Decay Time        | Alias to MIDI CC#75. (Decay Time)                                                                   | 64                               |
| 0x01     | 0x66     | EG Release Time      | Alias to MIDI CC#72. (Release Time)                                                                 | 64                               |
| 0x18     | rr       | Drum Pitch           | Controls the pitch of the drum instrument. [More info](#drum-pitch-coarse-implementation)           | 0                                |
| 0x19     | rr       | Drum Pitch Fine      | Controls the pitch of the drum instrument in cents (XG only)                                        | 0                                |
| 0x1A     | rr       | Drum Level           | Controls how loud the drum instrument is.                                                           | 120 (normal)                     |
| 0x1C     | rr       | Drum Pan             | Controls the absolute pan position of the drum instrument. 0 is random. (multiplicative of channel) | Unchanged.                       |
| 0x1D     | rr       | Drum Reverb          | Controls the reverb level of the drum instrument. (multiplicative of channel)                       | 0 for kick drums, otherwise 127. |
| 0x1E     | rr       | Drum Chorus          | Controls the chorus level of the drum instrument. (multiplicative of channel)                       | 127 for XG, otherwise 0.         |
| 0x1F     | rr       | Drum Variation       | Controls the variation level of the drum instrument.[^7] (multiplicative of channel)                | 0 (none)                         |

[^7]: This controls the delay level in GS/GM mode. In XG, it has no effect.

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

See the [MIDI Patch system](../spessa-synth-processor/midi-patch.md) for more information.

### `GM`

General MIDI (Level 1).

Ignores all bank select messages.

### `GS`

Roland GS, default.

Bank MSB processed directly, LSB is ignored, unless a direct match is found.
System Exclusive messages can be used to turn a channel into a drum channel.

### `GM2`

General MIDI Level 2.

Bank LSB and MSB are processed.
Default bank MSB is 121 instead of 0.
MSB can be used to turn a channel into a drum channel.
Drums will be selected according to the [XG Validity Test](../spessa-synth-processor/midi-patch.md#xg-validity-test)

### `XG`

Yamaha XG.

Bank LSB and MSB are processed.
MSB can be used to turn a channel into a drum channel.
Drums will be selected according to the [XG Validity Test](../spessa-synth-processor/midi-patch.md#xg-validity-test)

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
A [`displayMessage` event](../spessa-synth-processor/event-types.md#displaymessage) will be emitted with the System Exclusive data.

#### System Parameters

These are global parameters, affecting the entire synthesizer.
There's only one supported message in this category.

##### System Mode Set (SC-88+ Reset)

Resets the synthesizer and sets the `system` Global MIDI Parameter to `gs`.

Note that value `01` is defined as `Double Module Mode` and makes the synthesizer ensure that it has at least 32 channels.

#### Patch Common Parameters

These are global parameters, affecting the entire synthesizer.

##### System

| Name             | Description                                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MASTER TUNE      | Sets the Global MIDI Parameter [`fineTune`](../spessa-synth-processor/global-parameters.md#finetune_1).                                                                                                                    |
| MASTER VOLUME    | Sets the Global MIDI Parameter [`volume`](../spessa-synth-processor/global-parameters.md#volume).                                                                                                                          |
| MASTER KEY-SHIFT | Sets the Global MIDI Parameter [`keyShift`](../spessa-synth-processor/global-parameters.md#keyshift_1).                                                                                                                    |
| MASTER PAN       | Sets the Global MIDI Parameter [`pan`](../spessa-synth-processor/global-parameters.md#pan_1).                                                                                                                              |
| MODE SET         | Resets the synthesizer and sets the Global MIDI Parameter [`system`](../spessa-synth-processor/global-parameters.md#system_1) to `gs`.                                                                                     |
| PATCH NAME       | Treated as recognized, decoded name is logged to console if verbose output is enabled. A [`displayMessage` event](../spessa-synth-processor/event-types.md#displaymessage) will be emitted with the System Exclusive data. |

##### Reverb

| Name                  | Description                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REVERB MACRO          | Sets all Reverb Processor parameters to a predefined value. All GS macros are supported. Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf), page 81. |
| REVERB CHARACTER      | Sets the Reverb Processor property [`character`](../spessa-synth-processor/effects/reverb-processor.md#character).                                                                           |
| REVERB PRE-LPF        | Sets the Reverb Processor property [`preLowpass`](../spessa-synth-processor/effects/reverb-processor.md#prelowpass).                                                                         |
| REVERB LEVEL          | Sets the Reverb Processor property [`level`](../spessa-synth-processor/effects/reverb-processor.md#level).                                                                                   |
| REVERB TIME           | Sets the Reverb Processor property [`time`](../spessa-synth-processor/effects/reverb-processor.md#time).                                                                                     |
| REVERB DELAY FEEDBACK | Sets the Reverb Processor property [`delayFeedback`](../spessa-synth-processor/effects/reverb-processor.md#delayfeedback).                                                                   |
| REVERB PREDELAY TIME  | Sets the Reverb Processor property [`preDelayTime`](../spessa-synth-processor/effects/reverb-processor.md#predelaytime).                                                                     |

##### Chorus

| Name                        | Description                                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CHORUS MACRO                | Sets all Chorus Processor parameters to a predefined value. All GS macros are supported. Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf), page 83. |
| CHORUS PRE-LPF              | Sets the Chorus Processor property [`preLowpass`](../spessa-synth-processor/effects/chorus-processor.md#prelowpass).                                                                         |
| CHORUS LEVEL                | Sets the Chorus Processor property [`level`](../spessa-synth-processor/effects/chorus-processor.md#level).                                                                                   |
| CHORUS FEEDBACK             | Sets the Chorus Processor property [`feedback`](../spessa-synth-processor/effects/chorus-processor.md#feedback).                                                                             |
| CHORUS DELAY                | Sets the Chorus Processor property [`delay`](../spessa-synth-processor/effects/chorus-processor.md#delay).                                                                                   |
| CHORUS RATE                 | Sets the Chorus Processor property [`rate`](../spessa-synth-processor/effects/chorus-processor.md#rate).                                                                                     |
| CHORUS DEPTH                | Sets the Chorus Processor property [`depth`](../spessa-synth-processor/effects/chorus-processor.md#depth).                                                                                   |
| CHORUS SEND LEVEL TO REVERB | Sets the Chorus Processor property [`sendLevelToReverb`](../spessa-synth-processor/effects/chorus-processor.md#sendleveltoreverb).                                                           |
| CHORUS SEND LEVEL TO DELAY  | Sets the Chorus Processor property [`sendLevelToDelay`](../spessa-synth-processor/effects/chorus-processor.md#sendleveltodelay).                                                             |

##### Delay

| Name                       | Description                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DELAY MACRO                | Sets all Delay Processor parameters to a predefined value. All GS macros are supported. Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf), page 85. |
| DELAY PRE-LPF              | Sets the Delay Processor property [`preLowpass`](../spessa-synth-processor/effects/delay-processor.md#prelowpass).                                                                          |
| DELAY TIME CENTER          | Sets the Delay Processor property [`timeCenter`](../spessa-synth-processor/effects/delay-processor.md#timecenter).                                                                          |
| DELAY TIME RATIO LEFT      | Sets the Delay Processor property [`timeRatioLeft`](../spessa-synth-processor/effects/delay-processor.md#timeratioleft).                                                                    |
| DELAY TIME RATIO RIGHT     | Sets the Delay Processor property [`timeRatioRight`](../spessa-synth-processor/effects/delay-processor.md#timeratioright).                                                                  |
| DELAY LEVEL CENTER         | Sets the Delay Processor property [`levelCenter`](../spessa-synth-processor/effects/delay-processor.md#levelcenter).                                                                        |
| DELAY LEVEL LEFT           | Sets the Delay Processor property [`levelLeft`](../spessa-synth-processor/effects/delay-processor.md#levelleft).                                                                            |
| DELAY LEVEL RIGHT          | Sets the Delay Processor property [`levelRight`](../spessa-synth-processor/effects/delay-processor.md#levelright).                                                                          |
| DELAY LEVEL                | Sets the Delay Processor property [`level`](../spessa-synth-processor/effects/delay-processor.md#level).                                                                                    |
| DELAY FEEDBACK             | Sets the Delay Processor property [`feedback`](../spessa-synth-processor/effects/delay-processor.md#feedback).                                                                              |
| DELAY SEND LEVEL TO REVERB | Sets the Delay Processor property [`sendLevelToReverb`](../spessa-synth-processor/effects/delay-processor.md#sendleveltoreverb).                                                            |

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

!!! Warning

    GS can refer up to 32 channels, the top 16 can be accessed with `0x50` instead of `0x40` for the "BLOCK B".

    Parts above the current channel count are discarded. To avoid this, add more channels to the synthesizer.

| Name                              | Description                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TONE NUMBER                       | Bank MSB and Program Change in one message.                                                                                                                                           |
| Rx. CHANNEL                       | Sets the Channel MIDI Parameter [`rxChannel`](../spessa-synth-processor/midi-channel/channel-parameters.md#rxchannel).                                                                |
| MONO/POLY MODE                    | Sets the Channel MIDI Parameter [`polyMode`](../spessa-synth-processor/midi-channel/channel-parameters.md#polymode). See [poly/mono implementation](#polymono-implementation).        |
| ASSIGN MODE                       | Sets the Channel MIDI Parameter [`assignMode`](../spessa-synth-processor/midi-channel/channel-parameters.md#assignmode).                                                              |
| USE FOR RHYTHM PART               | Turns any channel into a drum channel.[^2] The Drum Map number is stored in Channel MIDI Parameter [`drumMap`](../spessa-synth-processor/midi-channel/channel-parameters.md#drummap). |
| PITCH KEY SHIFT                   | Sets the Channel MIDI Parameter [`keyShift`](../spessa-synth-processor/midi-channel/channel-parameters.md#keyshift_1).                                                                |
| PART LEVEL                        | Aliased to MIDI CC#7 (Main Volume).                                                                                                                                                   |
| VELOCITY SENSE DEPTH              | Sets the Channel MIDI Parameter [`velocitySenseDepth`](../spessa-synth-processor/midi-channel/channel-parameters.md#velocitysensedepth).                                              |
| VELOCITY SENSE OFFSET             | Sets the Channel MIDI Parameter [`velocitySenseOffset`](../spessa-synth-processor/midi-channel/channel-parameters.md#velocitysenseoffset).                                            |
| PART PANPOT                       | Aliased to MIDI CC#10 (Pan), except value `0` enables random pan for every new voice on that channel.                                                                                 |
| CC1 CONTROLLER NUMBER             | Sets the Channel MIDI Parameter [`cc1`](../spessa-synth-processor/midi-channel/channel-parameters.md#cc1).                                                                            |
| CC2 CONTROLLER NUMBER             | Sets the Channel MIDI Parameter [`cc2`](../spessa-synth-processor/midi-channel/channel-parameters.md#cc2).                                                                            |
| CHORUS SEND LEVEL                 | Aliased to MIDI CC#93 (Chorus Depth).                                                                                                                                                 |
| REVERB SEND LEVEL                 | Aliased to MIDI CC#91 (Reverb Depth).                                                                                                                                                 |
| PITCH FINE TUNE                   | Sets the Channel MIDI Parameter [`fineTune`](../spessa-synth-processor/midi-channel/channel-parameters.md#finetune_1).                                                                |
| DELAY SEND LEVEL                  | Aliased to MIDI CC#94 (Variation Depth).                                                                                                                                              |
| TONE MODIFY1 (Vibrato rate)       | Aliased to MIDI CC#76 (Vibrato Rate).                                                                                                                                                 |
| TONE MODIFY2 (Vibrato depth)      | Aliased to MIDI CC#77 (Vibrato Depth).                                                                                                                                                |
| TONE MODIFY3 (TVF Cutoff Freq)    | Aliased to MIDI CC#74 (Brightness).                                                                                                                                                   |
| TONE MODIFY4 (TVF Resonance)      | Aliased to MIDI CC#71 (Filter Resonance).                                                                                                                                             |
| TONE MODIFY5 (TVF&TVA Env.attack) | Aliased to MIDI CC#73 (Attack Time).                                                                                                                                                  |
| TONE MODIFY6 (TVF&TVA Env.decay)  | Aliased to MIDI CC#75 (Decay Time).                                                                                                                                                   |
| TONE MODIFY7 (TVA Env.release)    | Aliased to MIDI CC#72 (Release Time).                                                                                                                                                 |
| TONE MODIFY8 (Vibrato delay)      | Aliased to MIDI CC#78 (Vibrato Delay).                                                                                                                                                |
| SCALE TUNING                      | Treated like MTS octave tuning, allows to tune an octave in cents. Tuning is repeated for all octaves.                                                                                |
| \* CONTROL                        | See [Patch Part Parameters (Controllers)](#patch-part-parameters-controllers) for more details.                                                                                       |
| TONE MAP NUMBER                   | Aliased to MIDI CC#32 (Bank Select LSB).                                                                                                                                              |
| TONE MAP-0 NUMBER                 | Aliased to MIDI CC#32 (Bank Select LSB).                                                                                                                                              |
| PART EFX ASSIGN                   | Sets the Channel MIDI Parameter [`efxAssign`](../spessa-synth-processor/midi-channel/channel-parameters.md#efxassign).                                                                |

[^2]: Unlike with Sound Canvases, there's no limit to drum channels the synthesizer can have.

#### Patch Part Parameters (Controllers)

All of them are supported! At least, in theory.
These define how a controller affects the sound.
See page 198 of the SC-88Pro Manual.
This is implemented using a dynamic modulator system and additional generators to cover the linear time and hertz range.

There are two special cases that are directly aliased to Channel MIDI Parameters:

- MOD LFO1 PITCH DEPTH - Sets the Channel MIDI Parameter [`modulationDepth`](../spessa-synth-processor/midi-channel/channel-parameters.md#modulationdepth).
- BEND PITCH CONTROL - Sets the Channel MIDI Parameter [`pitchWheelRange`](../spessa-synth-processor/midi-channel/channel-parameters.md#pitchwheelrange).

#### Drum Setup Parameters

The following messages allow to tune drum instruments.
A drum instrument is defined as a single MIDI key in the drum preset.
These search for a matching drum channel with the correct `drumMap` Channel MIDI Parameter.

| Name                | Description                                                                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DRUM MAP NAME       | Treated as recognized, decoded name is logged to console if verbose output is enabled. A [`displayMessage` event](../spessa-synth-processor/event-types.md#displaymessage) will be emitted with the System Exclusive data. |
| PLAY NOTE NUMBER    | Relative pitch tuning of the instrument. [More info](#drum-pitch-coarse-implementation)                                                                                                                                    |
| LEVEL               | The drum's loudness. These are normalized against 120 (`gain = data / 120`).                                                                                                                                               |
| ASSIGN GROUP NUMBER | This overrides the `exclusiveClass` generator, allowing to define custom exclusive notes.                                                                                                                                  |
| PANPOT              | Pan position of the instrument, except value `0` enables random panning for every note. (multiplicative of channel)                                                                                                        |
| REVERB SEND LEVEL   | Reverb send level of the instrument. (multiplicative of channel)                                                                                                                                                           |
| CHORUS SEND LEVEL   | Chorus send level of the instrument. (multiplicative of channel)                                                                                                                                                           |
| Rx. NOTE OFF        | Enabling this (as it is disabled by default) forces the drum instrument to immediately terminate when it receives a Note Off.                                                                                              |
| Rx. NOTE ON         | This allows to disable a specific drum instrument from receiving Note On events.                                                                                                                                           |
| DELAY SEND LEVEL    | Delay send level of the instrument. (multiplicative of channel)                                                                                                                                                            |

### Yamaha XG

SpessaSynth has decent support for the XG standard, but it does not include any effects.
Below are the supported Yamaha XG System Exclusive messages.

#### System parameters

These are global parameters, affecting the entire synthesizer.

| Name                | Description                                                                                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| MASTER TUNE         | Sets the Global MIDI Parameter [`fineTune`](../spessa-synth-processor/global-parameters.md#finetune_1).                                |
| MASTER VOLUME       | Sets the Global MIDI Parameter [`volume`](../spessa-synth-processor/global-parameters.md#volume).                                      |
| MASTER ATTENUATOR   | Sets the Global MIDI Parameter [`volume`](../spessa-synth-processor/global-parameters.md#volume) with an inverted value.               |
| MASTER TRANSPOSE    | Sets the Global MIDI Parameter [`keyShift`](../spessa-synth-processor/global-parameters.md#keyshift_1)                                 |
| XG SYSTEM ON        | Resets the synthesizer and sets the Global MIDI Parameter [`system`](../spessa-synth-processor/global-parameters.md#system_1) to `xg`. |
| ALL PARAMETER RESET | Resets the synthesizer and sets the Global MIDI Parameter [`system`](../spessa-synth-processor/global-parameters.md#system_1) to `xg`. |

#### Reverb, chorus, and variation block

Reverb, chorus, and variation parameter addresses are _not supported (yet)_.
They are ignored and logged to console in verbose output.

#### Part Setup

Part (channel) parameters set a specific parameter for a specific channel.

!!! Warning

    XG part (channel) number may range from 0 to 64.

    Parts above the current channel count are discarded. To avoid this, add more channels to the synthesizer.

| Name                           | Description                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BANK SELECT MSB                | Aliased to MIDI CC#0 (Bank Select).                                                                                                                                            |
| BANK SELECT LSB                | Aliased to MIDI CC#32 (Bank Select LSB).                                                                                                                                       |
| PROGRAM CHANGE                 | Same as a MIDI Program Change on that part's channel.                                                                                                                          |
| RECEIVE CHANNEL NUMBER         | Sets the Channel MIDI Parameter [`rxChannel`](../spessa-synth-processor/midi-channel/channel-parameters.md#rxchannel).                                                         |
| POLY/MONO MODE                 | Sets the Channel MIDI Parameter [`polyMode`](../spessa-synth-processor/midi-channel/channel-parameters.md#polymode). See [poly/mono implementation](#polymono-implementation). |
| SAME NOTE NUMBER KEY ON ASSIGN | Sets the Channel MIDI Parameter [`assignMode`](../spessa-synth-processor/midi-channel/channel-parameters.md#assignmode).                                                       |
| PART MODE                      | `0` = normal (melodic) part; any non-zero value turns the part into a drum channel.[^3]                                                                                        |
| NOTE SHIFT                     | Sets the Channel MIDI Parameter [`keyShift`](../spessa-synth-processor/midi-channel/channel-parameters.md#keyshift_1).                                                         |
| VOLUME                         | Aliased to MIDI CC#7 (Main Volume).                                                                                                                                            |
| VELOCITY SENSE DEPTH           | Sets the Channel MIDI Parameter [`velocitySenseDepth`](../spessa-synth-processor/midi-channel/channel-parameters.md#velocitysensedepth).                                       |
| VELOCITY SENSE OFFSET          | Sets the Channel MIDI Parameter [`velocitySenseOffset`](../spessa-synth-processor/midi-channel/channel-parameters.md#velocitysenseoffset).                                     |
| PAN                            | Aliased to MIDI CC#10 (Pan), except value `0` enables random pan for every new voice on that channel.                                                                          |
| CHORUS                         | Aliased to MIDI CC#93 (Chorus Depth).                                                                                                                                          |
| REVERB                         | Aliased to MIDI CC#91 (Reverb Depth).                                                                                                                                          |
| VIBRATO RATE                   | Aliased to MIDI CC#76 (Vibrato Rate).                                                                                                                                          |
| VIBRATO DEPTH                  | Aliased to MIDI CC#77 (Vibrato Depth).                                                                                                                                         |
| VIBRATO DELAY                  | Aliased to MIDI CC#78 (Vibrato Delay).                                                                                                                                         |
| FILTER CUTOFF                  | Aliased to MIDI CC#74 (Brightness).                                                                                                                                            |
| FILTER RESONANCE               | Aliased to MIDI CC#71 (Filter Resonance).                                                                                                                                      |
| ATTACK TIME                    | Aliased to MIDI CC#73 (Attack Time).                                                                                                                                           |
| DECAY TIME                     | Aliased to MIDI CC#75 (Decay Time).                                                                                                                                            |
| RELEASE TIME                   | Aliased to MIDI CC#72 (Release Time).                                                                                                                                          |
| BEND PITCH CONTROL             | Sets the Channel MIDI Parameter [`pitchWheelRange`](../spessa-synth-processor/midi-channel/channel-parameters.md#pitchwheelrange).                                             |

[^3]: In XG, the conventional drum channel (9 within each 16-channel group) cannot be switched back to melodic mode.

#### Drum Setup

The following messages allow to tune drum instruments.
A drum instrument is defined as a single MIDI key in the drum preset.

Edits are applied to _every drum channel_: for each note/key,
all drum channels get the same stored parameters, as there isn't a MAP system, like in GS.

| Name            | Description                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| PITCH COARSE    | Relative pitch tuning of the instrument. [More info](#drum-pitch-coarse-implementation)                                       |
| PITCH FINE      | Cent tuning for the drum instrument.                                                                                          |
| LEVEL           | Normalizes loudness as `gain = data / 120` (same scaling as GS drum level).                                                   |
| ALTERNATE GROUP | Overrides the `exclusiveClass` generator for that drum instrument.                                                            |
| PAN             | Pan position of the instrument, except value `0` enables random panning for every note. (multiplicative of channel)           |
| REVERB SEND     | Reverb send level of the instrument. (multiplicative of channel)                                                              |
| CHORUS SEND     | Chorus send level of the instrument. (multiplicative of channel)                                                              |
| VARIATION SEND  | Variation send level of the instrument.[^4] (multiplicative of channel)                                                       |
| Rev NOTE OFF    | Enabling this (as it is disabled by default) forces the drum instrument to immediately terminate when it receives a Note Off. |
| Rev NOTE ON     | This allows to disable a specific drum instrument from receiving Note On events.                                              |

[^4]: Variation is not yet implemented.

#### Display Data

| Name           | Description                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display Letter | The text that XG MIDIs display on the device. A [`displayMessage` event](../spessa-synth-processor/event-types.md#displaymessage) will be emitted with the System Exclusive data. |
| Display Bitmap | Dot matrix display data for the XG devices. A [`displayMessage` event](../spessa-synth-processor/event-types.md#displaymessage) will be emitted with the System Exclusive data.   |

### Universal MIDI System Exclusive

SpessaSynth has decent support for the Universal MIDI System Exclusives, including General MIDI 2 and Device Control messages.
Below are the supported Universal System Exclusive messages.

#### Device Control

| Name                 | Description                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Master Volume        | Sets the Global MIDI Parameter [`volume`](../spessa-synth-processor/global-parameters.md#volume).       |
| Master Balance       | Sets the Global MIDI Parameter [`pan`](../spessa-synth-processor/global-parameters.md#pan_1).           |
| Master Fine-Tuning   | Sets the Global MIDI Parameter [`fineTune`](../spessa-synth-processor/global-parameters.md#finetune_1). |
| Master Coarse Tuning | Sets the Global MIDI Parameter [`keyShift`](../spessa-synth-processor/global-parameters.md#keyshift_1). |

#### Global Parameter Control

| Name           | Description                                                                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reverb Type    | Sets all Reverb Processor parameters to a predefined value. All GS macros are supported. Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf), page 81. |
| Reverb Time    | Sets the Reverb Processor property [`time`](../spessa-synth-processor/effects/reverb-processor.md#time).                                                                                     |
| Chorus Type    | Sets all Chorus Processor parameters to a predefined value. All GS macros are supported. Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf), page 83. |
| Mod Rate       | Sets the Chorus Processor property [`rate`](../spessa-synth-processor/effects/chorus-processor.md#rate).                                                                                     |
| Mod Depth      | Sets the Chorus Processor property [`depth`](../spessa-synth-processor/effects/chorus-processor.md#depth).                                                                                   |
| Feedback       | Sets the Chorus Processor property [`feedback`](../spessa-synth-processor/effects/chorus-processor.md#feedback).                                                                             |
| Send to Reverb | Sets the Chorus Processor property [`sendLevelToReverb`](../spessa-synth-processor/effects/chorus-processor.md#sendleveltoreverb).                                                           |

#### General MIDI

| Name          | Description                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| GM System Off | Resets the synthesizer and sets the Global MIDI Parameter [`system`](../spessa-synth-processor/global-parameters.md#system_1) to `gs`.  |
| GM1 System On | Resets the synthesizer and sets the Global MIDI Parameter [`system`](../spessa-synth-processor/global-parameters.md#system_1) to `gm`.  |
| GM2 System On | Resets the synthesizer and sets the Global MIDI Parameter [`system`](../spessa-synth-processor/global-parameters.md#system_1) to `gm2`. |

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
Any note on message will immediately terminate all currently active voices on the channel.
Releasing a note while another one is held will retrigger the highest currently held note,
with the velocity of the last Note On.

### Portamento Implementation

SpessaSynth attempts to recreate the old Sound Canvas/Yamaha XG portamento behavior.

That is:

- Portamento Time is only 7-bit. (only CC#5 is processed)
- Setting Portamento Control (CC#84) overrides the current from key and forces portamento _once_, regardless of CC#65 (Portamento On/Off) being enabled.
- If Portamento is on (CC#65 >= 64), the note glides from the previous note.
- For XG, the initial key to glide from is 60, for other systems there's no initial glide.
- Portamento Time depends on the distance of the keys. The rate is constant so the time scales linearly with distance.
  The final calculation is `portamentoSeconds = portaTimeToRate(cc5) * keyDistance`
- The details of the `portaTimeToRate` function [can be found here.](https://github.com/spessasus/spessasynth_core/blob/master/src/synthesizer/audio_engine/channel/portamento_time.ts)
- If you know a more accurate algorithm, please let me know!

### Drum Pitch Coarse Implementation

Relative pitch tuning of the drum instrument has special handling.
Precision depends on the mode:

For XG: The drum tuning resolution is 100 cents, i.e. a semitone.

For GS: It depends on the bank LSB number:

- Bank LSB value of 1 indicates an SC-55 preset, the resolution is 100 cents, i.e. a semitone
- Any other value is treated as SC-88 or higher, where the resolution (for whatever reason) is 50 cents.

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

Implemented using 3 delay lines, with the central one having feedback and feeding into the stereo delays.
Input is fed to all three.

Disabled in XG mode as CC#94 (used as delay send level) is used for Variation which is not implemented.

## Insertion Effects

SpessaSynth has an architecture in place to support SC-88Pro+ insertion effects.

### Currently implemented insertion effects

- Stereo-EQ
- Phaser
- Auto Pan
- Auto Wah (needs improvements)
- Tremolo
- PH / Auto Wah
