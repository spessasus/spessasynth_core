# MIDI Implementation

This describes what messages SpessaSynth can receive.

[Here is a useful resource about the MIDI standard. It's in japanese, but all the PDFs are english.](https://amei.or.jp/midistandardcommittee/RP&CAj.html)

## Supported MIDI Messages

| Message           | Supported? | Notes                                                                                                                |
| ----------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| Note On           | ✔️         | [More info](#overlapping-notes)                                                                                      |
| Note Off          | ✔️         | Does not support note off velocity (Per SF2 specification) [More info](#overlapping-notes)                           |
| Poly Pressure     | ✔️         | Recognized, but no default behavior (Per SF2 specification). Has to be defined with modulators or System Exclusives. |
| Controller Change | ✔️         | [More info](#default-supported-controllers)                                                                          |
| Program Change    | ✔️         | [More info](../spessa-synth-processor/midi-patch.md).                                                                |
| Channel Pressure  | ✔️         | 50 cents of vibrato (Per SF2 specification)                                                                          |
| Pitch Wheel       | ✔️         | Controlled by Pitch Wheel Range. [More info](#per-note-pitch-wheel).                                                 |
| System Exclusive  | ✔️         | [More info](#system-exclusives)                                                                                      |
| Time Code         | ❌         | Not Applicable                                                                                                       |
| Song Position     | ❌         | Not Applicable                                                                                                       |
| Song Select       | ❌         | Not Applicable                                                                                                       |
| Tune Request      | ❌         | Not Applicable                                                                                                       |
| MIDI Clock        | ❌         | Not Applicable                                                                                                       |
| MIDI Start        | ❌         | Not Applicable                                                                                                       |
| MIDI Continue     | ❌         | Not Applicable                                                                                                       |
| MIDI Stop         | ❌         | Not Applicable                                                                                                       |
| Active Sense      | ❌         | Not Applicable                                                                                                       |
| System Reset      | ✔️         | This message can only be received via MIDI commands as 0xFF in MIDI files means a meta message.                      |

### Per-Note Pitch Wheel

As of 4.1.0 SpessaSynth supports per-note Pitch Wheel as a part of the MIDI 2.0 specification.
Per-note mode is activated through the API and deactivated on channel or system reset.

!!! Note

    This is API-only, there are no MIDI messages that allow for changing it for now.

## Controllers

### Default Supported Controllers

Below is the list of controllers supported by default.

!!! Note

    Any MIDI CC can affect synthesis through modulators,
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
| 8                    | Balance                             | Extended | Controls the channel's stereo balance.                                                                                                                              |
| 7                    | Main Volume                         | SF2      | Changes the channel's volume.                                                                                                                                       |
| 10                   | Pan                                 | SF2      | Controls the channel's stereo pan.                                                                                                                                  |
| 11                   | Expression                          | SF2      | Changes the channel's volume, similarly to Main Volume, but independent of it.                                                                                      |
| 32                   | Bank Select LSB                     | Engine   | Changes the bank number that is used in Program Change. [More info](../spessa-synth-processor/midi-patch.md)                                                        |
| 33 - 64 excluding 38 | Controller LSB values               | Engine   | Extends the precision of the corresponding controllers from 7-bit to 14-bit.                                                                                        |
| 38                   | Data Entry LSB                      | Engine   | Sets the selected RPN or NRPN to the given value. Lower 7 bits. [More info](#parameter-numbers)                                                                     |
| 64                   | Sustain Pedal                       | Engine   | Holds the Note Off messages until the pedal is off, then stops them all at once.                                                                                    |
| 65                   | Portamento On/Off                   | Engine   | Controls if the portamento is enabled or not. [More info](#portamento-implementation)                                                                               |
| 67                   | Soft Pedal                          | Extended | Attenuates the channel and applies a low-pass filter.                                                                                                               |
| 71                   | Filter Resonance                    | Extended | Controls the filter resonance of the given patch.                                                                                                                   |
| 72                   | Release Time                        | Extended | Controls the release time for the given patch.                                                                                                                      |
| 73                   | Attack Time                         | Extended | Controls the attack time for the given patch.                                                                                                                       |
| 74                   | Brightness                          | Extended | Controls the brightness (lowpass frequency) of the given patch.                                                                                                     |
| 75                   | Decay time                          | Extended | Controls the decay time for the given patch.                                                                                                                        |
| 84                   | Portamento Control                  | Engine   | Controls the portamento target key. [More info](#portamento-implementation)                                                                                         |
| 91                   | Reverb Depth                        | SF2      | Controls the reverb effect send for the given channel. [More info](../sound-bank/modulator.md#reverb-and-chorus-modulators)                                         |
| 93                   | Chorus Depth                        | SF2      | Controls the chorus effect for the given channel. [More info](../sound-bank/modulator.md#reverb-and-chorus-modulators)                                              |
| 94                   | Variation Depth                     | Engine   | Controls the delay effect for the given channel.                                                                                                                    |
| 98                   | Non-Registered Parameter Number LSB | Engine   | Selects a Non-Registered Parameter's Fine to the given value. [More info](#supported-non-registered-parameters)                                                     |
| 99                   | Non-Registered Parameter Number MSB | Engine   | Selects a Non-Registered Parameter's Coarse to the given value. [More info](#supported-non-registered-parameters)                                                   |
| 100                  | Registered Parameter Number LSB     | Engine   | Selects a Registered Parameter's Fine to the given value. [More info](#supported-registered-parameters)                                                             |
| 101                  | Registered Parameter Number MSB     | Engine   | Selects a Registered Parameter's Coarse to the given value. [More info](#supported-registered-parameters)                                                           |
| 120                  | All Sound Off                       | Engine   | Immediately terminates all active voices, disregarding their release time.                                                                                          |
| 121                  | Reset All Controllers               | Engine   | Resets controllers to their default values according to the [RP-15 recommended practice.](https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf) |
| 123                  | All Notes Off                       | Engine   | Stops all notes, respecting their release time.                                                                                                                     |
| 124 or 125           | Omni mode On/Off                    | Engine   | Stops all notes, respecting their release time.                                                                                                                     |
| 126 or 127           | Poly/Mono Mode On/Off               | Engine   | Setting the corresponding controller to any value to switch the Poly mode on or off. [More info](#polymono-implementation)                                          |

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

    Reverb is 0 by default contrary to the MIDI specification as it can introduce unwanted sounds.

### Parameter Numbers

#### Supported Registered Parameters

Below is the list of currently implemented Registered Parameters.

| RPN MSB | RPN LSB | Name                     | Explanation                                                                                                                                                                                                                                          | Default                      |
| ------- | ------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 0       | 0       | Pitch Wheel range        | The range in semitones of the `synth.pitchWheel()` method.                                                                                                                                                                                           | 2 semitones                  |
| 0       | 2       | Channel Coarse Tuning    | The channel's tuning in semitones. Treated as key shift internally (per GM2 recommendation)                                                                                                                                                          | 0 keys                       |
| 0       | 3       | Channel Fine Tuning      | The channel's tuning, like a pitch wheel message (precise tuning in 2 semitones)                                                                                                                                                                     | 0 cents                      |
| 0       | 5       | Channel Modulation Depth | The channel's modulation (vibrato) depth. Note that this doesn't set the cents directly, but rather scales the modulator value (for example if set to twice the MIDI default value, the modulator controlling vibrato depth will be multiplied by 2) | Default SF2 depth (50 cents) |
| 127     | 127     | Reset parameters         | Resets the selected RPN/NRPN to NULL (unspecified state). All data entries in this state are recognized as ignored.                                                                                                                                  | N.A.                         |

#### Supported Non-Registered Parameters

Below is the list of currently implemented Non-Registered Parameters.

rr: Drum MIDI note number (0 - 127)

| NRPN MSB | NRPN LSB | Name                 | Explanation                                                                   | Default                          |
| -------- | -------- | -------------------- | ----------------------------------------------------------------------------- | -------------------------------- |
| 0x01     | 0x08     | Vibrato Rate         | Alias to MIDI CC#76. (Vibrato Rate)                                           | 64                               |
| 0x01     | 0x09     | Vibrato Depth        | Alias to MIDI CC#77. (Vibrato Depth)                                          | 64                               |
| 0x01     | 0x0A     | Vibrato Delay        | Alias to MIDI CC#78. (Vibrato Delay)                                          | 64                               |
| 0x01     | 0x20     | TVF Filter Cutoff    | Alias to MIDI CC#74. (Brightness)                                             | 64                               |
| 0x01     | 0x21     | TVF Filter Resonance | Alias to MIDI CC#71. (Filter resonance)                                       | 64                               |
| 0x01     | 0x63     | EG Attack Time       | Alias to MIDI CC#73. (Attack Time)                                            | 64                               |
| 0x01     | 0x64     | EG Decay Time        | Alias to MIDI CC#75. (Decay Time)                                             | 64                               |
| 0x01     | 0x66     | EG Release Time      | Alias to MIDI CC#72. (Release Time)                                           | 64                               |
| 0x18     | rr       | Drum Pitch           | Controls the pitch of the drum instrument.                                    | 0                                |
| 0x18     | rr       | Drum Pitch Fine      | Controls the pitch of the drum instrument in cents (XG only)                  | 0                                |
| 0x1A     | rr       | Drum Level           | Controls how loud the drum instrument is.                                     | 120 (normal)                     |
| 0x1C     | rr       | Drum Pan             | Controls the pan position of the drum instrument. 0 is random.                | 64 (channel pan)                 |
| 0x1D     | rr       | Drum Reverb          | Controls the reverb level of the drum instrument. (multiplicative of channel) | 0 for kick drums, otherwise 127. |
| 0x1E     | rr       | Drum Chorus          | Controls the chorus level of the drum instrument. (multiplicative of channel) | 127 for XG, otherwise 0.         |
| 0x1F     | rr       | Drum Delay           | Controls the delay level of the drum instrument. (multiplicative of channel)  | 0 (none)                         |

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
- [FluidSynth AWE32 NRPN implementation](https://github.com/FluidSynth/fluidsynth/wiki/FluidFeatures#nrpn-control-change-implementation-chart)

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

Below are the supported Roland GS messages.

#### Display Data

##### Displayed Letter

The text that Sound Canvas MIDIs display on the device.
A `displayMessage` event will be emitted with the System Exclusive data.

##### Displayed Dot Data

Dot matrix display data for the Sound Canvas devices.
A `displayMessage` event will be emitted with the System Exclusive data.

#### System Parameters, Patch Common Parameters

These are global parameters, affecting the entire synthesizer.

##### System Mode Set (SC-88+ Reset)

Resets the synthesizer and switches it to GS mode. (GS reset)

##### Master Tune

Master fine tune of the synthesizer.

##### Master Volume

Master gain of the synthesizer.

##### Master Key-Shift

Master key shift of the synthesizer.

##### Master Pan

Master stereo pan position of the synthesizer.

##### Mode Set

Resets the synthesizer and switches it to GS mode. (GS reset)

##### Patch Name

Treated as recognized, decoded name is logged to console if verbose output is enabled.

##### Reverb Parameters

- Macro (all GS macros are supported)
- Character
- Pre-LPF
- Level
- Time
- Delay Feedback
- Predelay Time

These are forwarded to the reverb processor.

##### Chorus Parameters

- Macro (all GS macros are supported)
- Pre-LPF
- Level
- Feedback
- Delay
- Rate
- Depth
- Send Level To Reverb
- Send Level To Delay

These are forwarded to the chorus processor.

##### Delay Parameters

- Macro (all GS macros are supported)
- Pre-LPF
- Time Center
- Ratio Left
- Ratio Right
- Level Center
- Level Left
- Level Right
- Level
- Feedback
- Send Level To Reverb

These are forwarded to the delay processor.

##### EFX Parameters

EFX means Insertion Effect. Both are used interchangeably.

- EFX Type
- EFX parameters 1-20
- Send Level To Reverb
- Send Level To Chorus
- Send Level To Delay

These are forwarded to the insertion processor. See [supported insertion effects](#currently-implemented-insertion-effects)

#### Patch Part Parameters

Part (channel) specific parameters.

##### Tone Number

Bank MSB + Program change in one message.

##### Rx. Channel

Channel number receive.
This allows to combine two instruments on "one" channel.

##### Mono/Poly Mode

Switches between poly and mono modes.
See [implementation details](#polymono-implementation).

##### Assign mode

Assign Mode is the parameter that determines how voice assignment will be
handled when sounds overlap on identical note numbers in the same channel
(i.e., repeatedly struck notes).
This is initialized to a mode suitable for each Part,
so for general purposes there is no need to change this.
Modes:

- Single: If the same note is played multiple times in succession, the previously-sounding note will be completely silenced, and then the new note will be sounded.
- LimitedMulti: If the same note is played multiple times in succession, the previously-sounding note will be continued to a certain extent even after the new note is sounded. (Default setting)
- FullMulti: If the same note is played multiple times in succession, the previously-sounding note(s) will continue sounding for their natural length even after the new note is sounded.

Note that SpessaSynth treats LimitedMulti like FullMulti.

##### Use for Rhythm Part

This message allows to turn any channel into a drum channel.
Unlike with sound canvases, there's no limit to drum channels the synthesizer can have.
The map number is stored in the channel for drum tuning.

##### Pitch Key Shift

Channel transposition in semitones (the MIDI notes are shifted)

##### MIDI Controller aliases

These System Exclusives are equivalent to the following [MIDI controllers](#default-supported-controllers)

- Part Level = CC#7.
- Part Pan Position = CC#10, except for 0 which enables random panning for every note.
- Chorus Send Level = CC#93
- Reverb Send Level = CC#91
- Delay Send Level = CC#94
- Vibrato Rate = CC#76
- Vibrato Depth = CC#77
- Vibrato Delay = CC#78
- TVF Cutoff = CC#74
- TVF Resonance = CC#71
- TVA Attack Time = CC#73
- TVA Decay Time = CC#75
- TVA Release Time = CC#72

##### Velocity Sense Depth

Adjusts the way note velocity is transformed.
See the [corresponding MIDI Parameter](../spessa-synth-processor/midi-channel/channel-parameters.md#velocitysensedepth).

##### Velocity Sense Offset

Allows offsetting the note velocity
See the [corresponding MIDI Parameter](../spessa-synth-processor/midi-channel/channel-parameters.md#velocitysenseoffset).

##### CC1, CC2 Controller Number

These two controllers can be bound in the [controller matrix](#patch-part-parameters-controllers)
to control a specific voice parameter.

##### Pitch Fine Tune

Same as the Fine-Tuning RPN, in cents.

##### Scale Tuning

Treated like MTS octave tuning, allows to tune an octave in cents.
Tuning is repeated for all octaves.

##### Tone Map Number, Tone Map-0 Number

Treated as Bank LSB controller change.

##### Part EFX Assign

Defines if the channel should use the insertion effect or not.
If it does, all of its audio gets routed through the insertion effect
and therefore all effect sends have no effect on it,
as these are determined by the insertion processor, which receives dry voice data.

#### Patch Part Parameters (Controllers)

All of them are supported! At least, in theory.
These define how a controller affects the sound.
See page 198 of the SC-88Pro Manual.
This is implemented using a dynamic modulator system and additional generators to cover the linear time and hertz range.

#### Drum Setup Parameters

The following messages allow to tune drum instruments.
A drum instrument is defined as a single MIDI key in the drum preset.
These search for a matching drum channel with the correct MAP number set.

##### Drum Map Name

The name is recognized and logged to console.

##### Pitch Coarse

Relative pitch tuning of the instrument
Precision depends on the mode:

- Bank LSB value of 1 indicates an SC-55 preset, the resolution is 100 cents, i.e. a semitone
- Any other value is treated as SC-88 or higher, where the resolution (for whatever reason) is 50 cents.

##### Level

The drum's loudness. These are normalized against 120 (`gain = data / 120`).

##### Assign Group Number

This overrides the `exclusiveClass` generator, allowing to define custom exclusive notes.

##### MIDI controllers

Drum note-specific MIDI controllers. They are relative to channel controllers.

- Pan Position = CC#10, except for 0 which enables random panning for every note.
- Chorus Send Level = CC#93
- Reverb Send Level = CC#91
- Delay Send Level = CC#94

##### Rx. Note Off

Enabling this (as it is disabled by default)
forces the drum instrument to immediately terminate when it receives a Note Off.

##### Rx. Note On

This allows to disable a specific drum instrument from receiving Note On events.

### Yamaha XG

Below are the supported Yamaha XG System Exclusive messages.

#### System parameters

These are global parameters, affecting the entire synthesizer.

##### Master Tune

14-bit value from MIDI nibbles, centered on 1024. In 1/10th of a cent.

##### Master Volume

Master output gain, same role as the GM MIDI Master Volume System Exclusive (normalized from 0 to 127).

##### Master Attenuation

Output attenuation; higher values mean quieter output (implemented as master volume from `127 − data`).

##### Master Transpose

Master transposition in semitones, 64 means no shift.

##### XG Reset

Performs an XG reset and switch the synth into XG mode.
The XG mode disables the delay effect.

#### Reverb, chorus, and variation block

Reverb, chorus, and variation parameter addresses are _not supported (yet)_.
They are ignored and logged to console in verbose output.

#### Part Setup

Part (channel) parameters set a specific parameter for a specific channel.

!!! Warning

    Parts above the current channel number are discarded. To avoid this, add more channels to the synthesizer.

| Number (hex) | Name                   | Description                                                                                                                                                                                     |
| ------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01           | Bank Select MSB        | Same as CC#0 (bank select).                                                                                                                                                                     |
| 02           | Bank Select LSB        | Same as CC#32 (bank select LSB).                                                                                                                                                                |
| 03           | Program Change         | Same as a MIDI Program Change on that part's channel.                                                                                                                                           |
| 04           | Receive channel number | Sets which MIDI channel the part listens on, like GS _Rx. Channel_. Enables layering two parts on one incoming channel.                                                                         |
| 05           | Poly/mono mode         | `1` = polyphonic, other values = monophonic. See [poly/mono implementation](#polymono-implementation).                                                                                          |
| 07           | Part mode              | `0` = normal (melodic) part; any non-zero value turns the part into a drum part. In XG, the conventional drum channel (9 within each 16-channel group) cannot be switched back to melodic mode. |
| 08           | Note shift             | Channel note shift in semitones: `data − 64`. Ignored on drum parts.                                                                                                                            |
| 0B           | Volume                 | Same as CC#7 (main volume).                                                                                                                                                                     |
| 0C           | Velocity Sense Depth   | Adjusts the way note velocity is transformed. See the [corresponding MIDI Parameter](../spessa-synth-processor/midi-channel/channel-parameters.md#velocitysensedepth).                          |
| 0D           | Velocity Sense Offset  | Allows offsetting the note velocity. See the [corresponding MIDI Parameter](../spessa-synth-processor/midi-channel/channel-parameters.md#velocitysenseoffset).                                  |
| 0E           | Pan                    | Same as CC#10, except value `0` enables random pan for every new voice on that channel.                                                                                                         |
| 12           | Chorus                 | Same as CC#93 (chorus send).                                                                                                                                                                    |
| 13           | Reverb                 | Same as CC#91 (reverb send).                                                                                                                                                                    |
| 15           | Vibrato Rate           | Same as CC#76 (vibrato rate).                                                                                                                                                                   |
| 16           | Vibrato Depth          | Same as CC#77 (vibrato depth).                                                                                                                                                                  |
| 17           | Vibrato Delay          | Same as CC#78 (vibrato delay).                                                                                                                                                                  |
| 18           | Filter Cutoff          | Same as CC#74 (brightness).                                                                                                                                                                     |
| 19           | Filter Resonance       | Same as CC#71 (filter resonance).                                                                                                                                                               |
| 1A           | Attack Time            | Same as CC#73 (attack time).                                                                                                                                                                    |
| 1B           | Decay Time             | Same as CC#75 (decay time).                                                                                                                                                                     |
| 1C           | Release Time           | Same as CC#72 (release time).                                                                                                                                                                   |
| 23           | Bend Pitch Control     | Treated as pitch wheel range.                                                                                                                                                                   |

#### Drum Setup

The following messages allow to tune drum instruments.
A drum instrument is defined as a single MIDI key in the drum preset.

Edits are applied to _every drum channel_: for each note/key,
all drum channels get the same stored parameters, as there isn't a MAP system, like in GS.

##### Pitch Coarse

Relative pitch in cents: `(data − 64) * 100`, matching XG coarse drum pitch resolution (see also [Drum Pitch NRPN](#supported-non-registered-parameters)).

##### Pitch Fine

Cent tuning for the drum instrument.
Send coarse tuning before fine if you rely on a defined baseline; fine is cumulative.

##### Drum Level

Normalizes loudness as `gain = data / 120` (same scaling as GS drum level).

##### Alternate Group

Overrides the `exclusiveClass` generator for that drum instrument.

##### MIDI Controllers

Like regular controllers, except for a specific drum instrument and not the whole channel.

- Pan Position = CC#10, except for 0 which enables random panning for every note.
- Chorus Send Level = CC#93
- Reverb Send Level = CC#91
- Delay Send Level = CC#94

##### Receive Note Off

Enabling this (as it is disabled by default)
forces the drum instrument to immediately terminate when it receives a Note Off.

##### Receive Note On

This allows to disable a specific drum instrument from receiving Note On events.

#### Display Data

##### Display Letter

The text that XG MIDIs display on the device.
A `displayMessage` event will be emitted with the System Exclusive data.

##### Display Bitmap

A dot matrix display data for the XG devices.
A `displayMessage` event will be emitted with the System Exclusive data.

### Universal MIDI System Exclusive

#### Device Control

##### Master Volume

Master gain of the synthesizer.

##### Master Balance

Master stereo pan position of the synthesizer.

##### Master Fine-Tuning

Master fine tune of the synthesizer.

##### Master Coarse Tuning

Master key shift of the synthesizer.

##### Global Parameter Control

Effect parameter tuning:

- Reverb
    - Type (macro)
    - Time
- Chorus
    - Type (macro)
    - Rate
    - Depth
    - Feedback
    - Send to Reverb

#### General MIDI

##### General MIDI On

Resets the synthesizer and switches it to GM mode.

##### General MIDI Off

Resets the synthesizer and switches it to GS mode.

##### General MIDI 2 On

Resets the synthesizer and switches it to GM2 mode.

#### MIDI Tuning Standard

Below are the supported messages for the MTS.
RT means realtime and NRT means non-realtime (both are treated as realtime).

##### Bulk Tuning Dump

Tuning dump for all 128 notes.

##### Scale Octave Tuning (1/2 bytes)

Tuning a single octave, repeated across the entire MIDI range.

##### Single Note Tuning Change

Tuning a single note. Note that this can theoretically be used as per-note Pitch Wheel.

## Implementation Details

### Overlapping Notes

As of 4.3.6 SpessaSynth supports overlapping MIDI notes (for example two consecutive Note On messages and two Note Off messages after),
matching the behavior of Sound Canvases and XG synthesizers.
Although overlapping notes are not technically permitted by the MIDI standard, some files [use them anyway](https://github.com/spessasus/spessasynth_core/issues/13).

The implementation is FIFO - First In, First Out.
The first voice that started playing on the note will be stopped upon receiving the Note Off.

The following example describes the behavior:

1. Program Change to 80 - Square Wave.
2. Note On 60, Square Wave starts playing.
3. Program Change to 81 - Saw Wave.
4. Note On 60, Saw Wave starts playing on top of Square Wave.
5. Note Off 60, Square Wave stops playing, only Saw Wave sounds.
6. Note Off 60, Saw Wave stops playing.

### Poly/Mono Implementation

SpessaSynth's poly/mono mode implementation works like GS implementation:

#### Poly Mode

Poly Mode is regular playback, multiple notes are allowed on the channel.
It is the default mode on all channels.

#### Mono Mode

Mono Mode allows only a single note on the channel.
Any note on message will immediately force all current voices on this channel to shut down.
Releasing a note while another one is held will retrigger the highest currently held note,
with the velocity of the last Note On.

### Portamento Implementation

SpessaSynth attempts to recreate the old Sound Canvas/Yamaha XG portamento behavior.

That is:

- Portamento Time is only 7-bit. (only CC#5 is processed)
- Portamento Control, if set, overrides the current from key and forces portamento once, regardless of CC#65 (Portamento On/Off).
- If Portamento is on (CC#65 >= 64), the note glides from the previous note with a constant rate.
- For XG, the initial key to glide from is 60, for other systems there's no initial glide.
- Portamento Time depends on the distance of the keys. The rate is constant so the time scales linearly with distance.
  The final calculation is `portamentoSeconds = portaTimeToRate(cc5) * keyDistance`
- The details of the `portaTimeToRate` function [can be found here.](https://github.com/spessasus/spessasynth_core/blob/master/src/synthesizer/audio_engine/channel/portamento_time.ts)
- If you know a more accurate algorithm, please let me know!

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
