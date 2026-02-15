# MIDI Implementation

This describes what messages SpessaSynth can receive.

[Here is a useful resource about the MIDI standard. It's in japanese, but all the PDFs are english.](https://amei.or.jp/midistandardcommittee/RP&CAj.html)

## Supported MIDI Messages

!!! Note

     ⚠️NON-STANDARD!⚠️ means that this is an additional modulator that is not specified in the SF2 specification.

| Message           | Supported? | Notes                                                                                                                |
| ----------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| Note On           | ✔️         |                                                                                                                      |
| Note Off          | ✔️         | Does not support note off velocity (Per SF2 specification)                                                           |
| Note Aftertouch   | ✔️         | Recognized, but no special behavior (Per SF2 specification). Has to be defined with modulators or system exclusives. |
| Controller Change | ✔️         | [See below](#default-supported-controllers)                                                                          |
| Program Change    | ✔️         | GM, GM2, GS, XG                                                                                                      |
| Channel Pressure  | ✔️         | 50 cents of vibrato                                                                                                  |
| Pitch Wheel       | ✔️         | Controlled by Pitch Wheel range (both semitones and cents) See [per-note pitch wheel](#per-note-pitch-wheel)         |
| System exclusive  | ✔️         | [See below](#supported-system-exclusives)                                                                            |
| Time Code         | ❌         | Not Applicable                                                                                                       |
| Song Position     | ❌         | Not Applicable                                                                                                       |
| Song Select       | ❌         | Not Applicable                                                                                                       |
| Tune Request      | ❌         | Not Applicable                                                                                                       |
| MIDI Clock        | ❌         | Not Applicable                                                                                                       |
| MIDI Start        | ❌         | Not Applicable                                                                                                       |
| MIDI Continue     | ❌         | Not Applicable                                                                                                       |
| MIDI Stop         | ❌         | Not Applicable                                                                                                       |
| Active Sense      | ❌         | Not Applicable                                                                                                       |
| System Reset      | ✔️         | Can only be received via MIDI ports as 0xFF in MIDI files means a meta message                                       |

### Per-note Pitch Wheel

As of 4.1.0 SpessaSynth supports per-note Pitch Wheel as a part of the MIDI 2.0 specification.
Note that this is API-only, there are no MIDI messages that allow for changing it for now.
The per-note mode will activate on using the API and deactivate on channel or system reset.

## Controllers

### Default Supported Controllers

Below is the list of controllers supported by default.
!!! Note

    Theoretically all controllers are supported as it depends on the SoundFont's modulators. These are the controllers that are supported by default/have default modulators.

!!! Note

    For more info, see [default modulators](../sound-bank/modulator.md#default-modulators)

| CC                   | Controller name                     | Value                                                                                                    | Explanation                                                                                                                                                            | Default value |
| -------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 0                    | Bank Select                         | The bank number (0 - 127)                                                                                | Changes the bank number that is used in programChange. Note that it doesn't change the preset on its own. [See this for more info](#supported-bank-systems)            | 0             |
| 1                    | Modulation Wheel                    | The modulation depth (0 - 127) mapped to max 50 cents of detune                                          | Controls the vibrato for the given patch.                                                                                                                              | 0             |
| 5                    | Portamento Time                     | The portamento time (0 - 127)                                                                            | Controls the portamento time. [See portamento implementation](#portamento-implementation) A value of 0 effectively disables portamento.                                | 0             |
| 6                    | Data Entry MSB                      | Data entry value (0 - 127)                                                                               | This sets the selected RP or NRP to the given value. Note that the RPN and NRPN controllers only select the parameter, while this controller actually sets the values. | none          |
| 8                    | Balance                             | 0 is left, 64 is middle, 127 is right                                                                    | Controls the channel's stereo balance.                                                                                                                                 | 64            |
| 7                    | Main Volume                         | The volume (0 - 127) 0 is silent, 127 is normal volume                                                   | Changes the channel's volume.                                                                                                                                          | 100           |
| 10                   | Pan                                 | 0 is left, 64 is middle, 127 is right                                                                    | Controls the channel's stereo pan.                                                                                                                                     | 64            |
| 11                   | Expression controller               | The expression (0 - 127) 0 is silent, 127 is normal volume                                               | Works exactly like Main Volume, but it's independent.                                                                                                                  | 127           |
| 32                   | Bank Select LSB                     | The bank number (0 - 127)                                                                                | Changes the bank number that is used in programChange. Note that it doesn't change the preset on its own. [See this for more info](#supported-bank-systems)            | 0             |
| 33 - 64 excluding 38 | Controller LSB values               | The lower nibble of the value (0 - 127)                                                                  | Allows precise control of values such as volume, expression, pan. Extends the precision from 0 - 127 to 0 - 16384 (!)                                                  | 0             |
| 38                   | Data Entry LSB                      | Data entry value (0 - 127)                                                                               | This sets the selected RP or NRP to the given value. Note that the RPN and NRPN controllers only select the parameter, while this controller actually sets the values. | none          |
| 64                   | Sustain Pedal                       | 0 - 63 is off, 64 - 127 is on                                                                            | Holds the noteOff messages until the pedal is off, then stops them all at once.                                                                                        | OFF           |
| 65                   | Portamento On/Off                   | 0 - 63 is off, 64 - 127 is on                                                                            | Controls if the portamento is enabled or not.                                                                                                                          | ON            |
| 67                   | Soft Pedal                          | 0 - 63 is off, 64 - 127 is on                                                                            | Attenuates the channel and applies a low-pass filter.                                                                                                                  | OFF           |
| 71                   | Filter Resonance                    | The resonance (0 - 127) 0 is 25 dB less, 64 is unchanged, 127 is 25 dB more ⚠️NON-STANDARD!⚠️            | Controls the filter resonance of the given patch.                                                                                                                      | 64            |
| 72                   | Attack Time                         | The attack time (0- 127) 64 is normal, 0 is the fastest, 127 is the slowest ⚠️NON-STANDARD!⚠️            | Controls the attack time for the given patch.                                                                                                                          | 64            |
| 73                   | Release Time                        | The release time (0- 127) 64 is normal, 0 is the fastest, 127 is the slowest ⚠️NON-STANDARD!⚠️           | Controls the release time for the given patch.                                                                                                                         | 64            |
| 74                   | Brightness                          | The brightness (0 - 127) 0 is muffled, 64 is no additional filter, 127 is most clear ⚠️NON-STANDARD!⚠️   | Controls the brightness (lowpass frequency) of the given patch.                                                                                                        | 64            |
| 75                   | Decay time                          | The decay time (0- 127) 64 is normal, 0 is the fastest, 127 is the slowest ⚠️NON-STANDARD!⚠️             | Controls the decay time for the given patch.                                                                                                                           | 64            |
| 84                   | Portamento Control                  | The key number glide should start from (0 - 127)                                                         | Controls the portamento target key. [See portamento implementation](#portamento-implementation)                                                                        | 0             |
| 91                   | Effects 1 Depth (reverb)            | The reverb depth (0 - 127) [See important info](../sound-bank/modulator.md#reverb-and-chorus-modulators) | Controls the reverb effect send for the given channel.                                                                                                                 | 0             |
| 92                   | Effects 2 Depth (tremolo)           | The tremolo depth (0 - 127) mapped to 25dB of loudness variation ⚠️NON-STANDARD!⚠️                       | Controls the tremolo (trembling) effect for the given patch.                                                                                                           | 0             |
| 93                   | Effects 3 Depth (chorus)            | The chorus depth (0 - 127) [See important info](../sound-bank/modulator.md#reverb-and-chorus-modulators) | Controls the chorus effect for the given channel.                                                                                                                      | 0             |
| 93                   | Effects 4 Depth (delay)             | The delay depth (0 - 127) Disabled in XG mode.                                                           | Controls the delay effect for the given channel.                                                                                                                       | 0             |
| 99                   | Non-Registered Parameter Number MSB | Parameter number (0 - 127)                                                                               | Selects a Non-Registered Parameter's Coarse to the given value. [Here are the currently supported values.](#supported-non-registered-parameters).                      | none          |
| 98                   | Non-Registered Parameter Number LSB | Parameter number (0 - 127)                                                                               | Selects a Non-Registered Parameter's Fine to the given value. [Here are the currently supported values.](#supported-non-registered-parameters).                        | none          |
| 100                  | Registered Parameter Number LSB     | Parameter number (0 - 127)                                                                               | Selects a Registered Parameter's Fine to the given value. [Here are the currently supported values.](#supported-registered-parameters).                                | none          |
| 101                  | Registered Parameter Number MSB     | Parameter number (0 - 127)                                                                               | Selects a Registered Parameter's Coarse to the given value. [Here are the currently supported values.](#supported-registered-parameters).                              | none          |
| 120 or 123           | All Notes Off or All Sound Off      | Not Applicable                                                                                           | Stops all the notes. Equivalent to MIDI "panic".                                                                                                                       | N.A.          |
| 121                  | Reset All Controllers               | Not Applicable                                                                                           | Resets controllers to their default values according to the RP-15 recommended practice.                                                                                | N.A.          |
| 124 or 125           | Omni mode On/Off                    | Not Applicable                                                                                           | Stops all the notes. Equivalent to MIDI "panic". This is for parity wit Roland GS devices.                                                                             | N.A.          |
| 126 or 127           | Poly/Mono Mode On/Off               | Not Applicable                                                                                           | Setting the corresponding controller to any value to switch the Poly mode on or off. Mono mode allows only one note at a time on this channel.                         | Poly          |

|

### Default controller values

!!! Important

    "Reset All Controllers" (CC#121) is implemented according
    to [RP-15 recommended practice.](https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf)

Below are all the controller values which are not zero when the controllers are reset.

| CC Number | Name                         | Reset Value |
| --------- | ---------------------------- | ----------- |
| 7         | Main Volume                  | 100         |
| 8         | Balance                      | 64          |
| 11        | Expression Controller        | 127         |
| 10        | Pan                          | 64          |
| 71        | Timbre Harmonic Content      | 64          |
| 72        | Release Time                 | 64          |
| 73        | Attack Time                  | 64          |
| 74        | Brightness                   | 64          |
| 75        | Sound Controller 6           | 64          |
| 76        | Sound Controller 7           | 64          |
| 77        | Sound Controller 8           | 64          |
| 78        | Sound Controller 9           | 64          |
| 81        | General Purpose Controller 6 | 64          |
| 83        | General Purpose Controller 8 | 64          |
| 91        | Reverb Send Level            | 40          |

## Parameter Numbers

### Supported Registered Parameters

Below is the list of currently implemented Registered Parameters.

| RPN MSB | RPN LSB | Name                     | Explanation                                                                                                                                                                                                                                                    | Default                      |
| ------- | ------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 0       | 0       | Pitch Wheel range        | The range in semitones of the `synth.pitchWheel()` method.                                                                                                                                                                                                     | 2 semitones                  |
| 0       | 2       | Channel Coarse Tuning    | The channel's tuning in semitones                                                                                                                                                                                                                              | No tuning (0 semitones)      |
| 0       | 3       | Channel Fine Tuning      | The channel's tuning, like a pitch wheel message (precise tuning in 2 semitones)                                                                                                                                                                               | No tuning (0 cents)          |
| 0       | 5       | Channel Modulation Depth | The channel's modulation (vibrato) depth. Note that this doesn't set the cents directly, but rather scales the soundfont modulator value (for example if set to twice the MIDI default value, the modulator controlling vibrato depth will be multiplied by 2) | default sf2 depth (50 cents) |
| 127     | 127     | Reset parameters         | Resets all parameters                                                                                                                                                                                                                                          | N.A.                         |

### Supported Non-Registered Parameters

Below is the list of currently implemented Non-Registered Parameters.
Note that all these are non-standard GM.
**These only apply for GS**

rr: Drum note number.

| NRPN MSB | NRPN LSB | Name                   | Explanation                                                                   | Default                         |
| -------- | -------- | ---------------------- | ----------------------------------------------------------------------------- | ------------------------------- |
| 0x1      | 0x8      | Vibrato rate (custom)  | Controls the vibrato rate. More info below.                                   | 0 (disabled)                    |
| 0x1      | 0x9      | Vibrato depth (custom) | Controls the vibrato depth. More info below.                                  | 0 (disabled)                    |
| 0x1      | 0xA      | Vibrato delay (custom) | Controls the vibrato delay. More info below.                                  | 0 (disabled)                    |
| 0x1      | 0x20     | TVF Filter Cutoff      | Controls the filter cutoff using the CC 74 (brightness)                       | 64 (no change)                  |
| 0x1      | 0x21     | TVF Filter Resonance   | Controls the filter resonance using the CC 71 (filter resonance)              | 64 (no change)                  |
| 0x01     | 0x66     | EG Release Time        | Controls the volume envelope release time using CC 72                         | 64 (no change)                  |
| 0x01     | 0x64     | EG Attack Time         | Controls the volume envelope attack time using CC 73                          | 64 (no change)                  |
| 0x18     | rr       | Drum Pitch             | Controls the pitch of the drum instrument.                                    | 0 (no change)                   |
| 0x18     | rr       | Drum Pitch Fine        | Controls the pitch of the drum instrument in cents (XG only)                  | 0 (no change)                   |
| 0x1a     | rr       | Drum Level             | Controls how loud the drum instrument is.                                     | 120 (normal)                    |
| 0x1c     | rr       | Drum Pan               | Controls the pan position of the drum instrument. 0 is random.                | 64 (channel pan)                |
| 0x1d     | rr       | Drum Reverb            | Controls the reverb level of the drum instrument. (multiplicative of channel) | 0 for kick drums, otherwise 127 |
| 0x1e     | rr       | Drum Chorus            | Controls the chorus level of the drum instrument. (multiplicative of channel) | 0 (none)                        |
| 0x1f     | rr       | Drum Delay             | Controls the delay level of the drum instrument. (multiplicative of channel)  | 0 (none)                        |

#### Custom Vibrato

The NPRN vibrato messages have special behavior.
On synth start and reset it is disabled.
Any value other than 64 received for any of the states activates it with the default settings:

- depth = 50 cents
- rate = 8 Hz
- delay = 0.6s

After which any changes received through the NRPN (including the one that triggered it) are processed.

Calculation for the specific NPRN parameters are as follows (value is the data entry MSB value from 0 to 127):

- Rate: `Hz = (value / 64) * 8`
- Depth: `cents = value / 2`
- Delay: `seconds = (64 / value) / 3`

This behavior has existed since the beginning of this program as a way to enhance Touhou Project MIDI files,
the original target of SpessaSynth.

**It is disabled for any channel that has CC#1 (Mod Wheel) set to anything other than 0.**
This can be useful as setting CC#1 to something like 1 (which is usually imperceptible),
will disable the extra vibrato for this channel.

[Custom vibrato can be disabled globally as well.](../spessa-synth-processor/midi-channel.md#disableandlockgsnprn)

#### SoundFont2 NRPN

As of 3.26.15, spessasynth supports the standard SF2 NRPN implementation,
as defined in Section 9.6 of the SoundFont2.04 specification.

#### AWE32 NRPN Compatibility Layer

As of 3.26.11, spessasynth supports emulation of the AWE32 NRPN generator modification.
The implementation is similar to fluidsynth's emulation,
as it has been tested and found relatively accurate to the sound cards.
Here are some useful resources about this:

- [AWE32 Frequently Asked Questions](http://archive.gamedev.net/archive/reference/articles/article445.html)
- [AWE32 Developer's Information Pack](https://github.com/user-attachments/files/15757220/adip301.pdf)
- [S. Christian Collins's AWE32 MIDI Conversion Repository](https://github.com/mrbumpy409/AWE32-midi-conversions)
- [S. Christian Collins's AWE32 NRPN Filter Tests](https://github.com/mrbumpy409/SoundFont-Spec-Test/tree/main/NRPN%20test%20-%20filter)
- [Fluidsynth AWE32 NPRN implementation](https://github.com/FluidSynth/fluidsynth/wiki/FluidFeatures#nrpn-control-change-implementation-chart)

There are a few differences from fluidsynth's implementation:

- LSB 16 overrides the `fineTune` generator instead of emitting a pitch-wheel event.
- Effect generators get overridden directly rather than passing through the modulator.
- Filter cutoff and Q have been tuned slightly differently.

## System Exclusives

### Supported System Exclusives

Below is the list of currently implemented System Exclusive messages.

| Name                   | Description                                                                       |
| ---------------------- | --------------------------------------------------------------------------------- |
| GM on                  | Turns the GM mode on. Ignores all the Bank Select controllers.                    |
| GM off                 | Turns the GM mode off. Defaults to GS                                             |
| GM2 on                 | Turns the GM2 mode on.                                                            |
| GS Reset               | Turns on the Roland GS mode.                                                      |
| XG Reset               | Turns on the Yamaha XG mode. Changes the bank selection system to XG.             |
| Roland Master Volume   | Controls the overall synth's volume.                                              |
| GS Parameters          | See [this for more info](#gs-parameters)                                          |
| MIDI Master Volume     | Controls the overall synth's volume.                                              |
| MIDI Master Balance    | Controls the overall synth's stereo panning.                                      |
| Roland SC Display Text | The text that SC-88 MIDIs display on the device. `synthdisplay` will be called.   |
| Roland SC Dot Matrix   | A dot matrix display for the Sound Canvas devices. `synthdisplay` will be called. |
| XG Display Letters     | The text that XG MIDIs display on the device. `synthdisplay` will be called.      |
| XG Display Bitmap      | The dot matrix display for XG devices. `synthdisplay` will be called.             |
| XG Master Tune         | Controls the overall synth's tuning.                                              |
| XG Master Volume       | Controls the overall synth's volume.                                              |
| XG Master Attenuator   | Controls the overall synth's attenuation (inverse of volume).                     |
| XG Master Transpose    | Controls the overall synth's transposition.                                       |
| XG Part Setup          | See [this for more info](#xg-part-setup)                                          |
| MIDI Tuning Standard   | See [this for more info](#midi-tuning-standard)                                   |

### Supported Bank systems

See the [MIDI Patch system](../spessa-synth-processor/midi-patch.md) for more information.

#### GM

General MIDI (Level 1).

Ignores all bank select messages.

#### GS

Roland GS, default.

Bank MSB processed directly, LSB is ignored.
SysEx can be used to turn a channel into a drum channel.

#### GM2

General MIDI Level 2.

Bank LSB and MSB are processed.
MSB can be used to turn a channel into a drum channel.
Drums will be selected according to the [XG Validity Test](../spessa-synth-processor/midi-patch.md#xg-validity-test)

#### XG

Yamaha XG.

Bank LSB and MSB are processed.
MSB can be used to turn a channel into a drum channel.
Drums will be selected according to the [XG Validity Test](../spessa-synth-processor/midi-patch.md#xg-validity-test)

### GS Parameters

Below are the supported GS SysEx Parameters.

#### System Parameters

- System Mode Set (SC-88 Reset)

#### Patch Common Parameters

- Master Tune
- Master Volume
- Master Key-Shift
- Master Pan
- Mode Set (GS Reset)
- Patch Name (logs to console)
- Reverb Macro
- Reverb Character
- Reverb Pre-LPF
- Reverb Level
- Reverb Time
- Reverb Delay Feedback
- Reverb Predelay Time
- Chorus Macro
- Chorus Pre-LPF
- Chorus Level
- Chorus Feedback
- Chorus Delay
- Chorus Rate
- Chorus Depth
- Chorus Send Level To Reverb
- Chorus Send Level To Delay
- Delay Macro
- Delay Pre-LPF
- Delay Time Center
- Delay Ratio Left
- Delay Ratio Right
- Delay Level Center
- Delay Level Left
- Delay Level Right
- Delay Level
- Delay Feedback
- Delay Send Level To Reverb

#### Patch Part Parameters

- Tone Number (Bank + Program change)
- Tone Map Number (Bank LSB)
- Tone Map-0 Number (treated as Bank LSB)
- Mono/Poly Mode
- Use for Rhythm Part
- Pitch Key Shift
- Part Level
- Part Pan Position
- CC1 Controller Number
- CC2 Controller Number
- Chorus Send Level
- Reverb Send Level
- Pitch Fine Tune
- Delay Send Level
- Vibrato Rate
- Vibrato Depth
- TVF Cutoff
- TVF Resonance
- TVA Attack Time
- TVA Decay Time
- TVA Release Time
- Vibrato Delay
- Scale Tuning

#### Patch Part Parameters (Controllers)

All Of them except for LFO rate as it's in Hz rather than cents.

These define how a controller affects the sound. See page 198 of the SC-88Pro Manual. This is implemented using a dynamic modulator system.

#### Drum Setup Parameters

- Drum Map Name (logs to console)
- Pitch Coarse
- Level
- Assign Group Number (exclusive class override)
- Pan Position
- Reverb Send Level
- Chorus Send Level
- Rx. Note Off (implemented as forcing instant release)
- Rx. Note On
- Delay Send Level

### XG Part Setup

Below are the supported part setup messages for XG.

| Number (hex) | Name                                                   |
| ------------ | ------------------------------------------------------ |
| 01           | Bank Select MSB                                        |
| 02           | Bank Select LSB                                        |
| 03           | Program change                                         |
| 0B           | Volume                                                 |
| 0E           | Pan A value of 0 means random panning for every voice. |
| 13           | Reverb                                                 |
| 12           | Chorus                                                 |
| 15           | Vibrato Rate                                           |
| 16           | Vibrato Depth                                          |
| 17           | Vibrato Decay                                          |
| 18           | Filter Cutoff                                          |
| 19           | Filter Resonance                                       |
| 1A           | Attack Time                                            |
| 1B           | Decay Time                                             |
| 1C           | Release Time                                           |

#### XG Drum Setup

The following drum setup messages are recognized:

- Pitch Coarse
- Pitch Fine (added to coarse so coarse must be sent first)
- Alternate Group (exclusive class override)
- Pan
- Reverb Send
- Chorus Send
- Rev. Note Off (implemented as forcing instant release)
- Rev. Note On

### MIDI Tuning Standard

Below are the supported messages for the MTS.
RT means realtime and NRT means non-realtime (both are treated as realtime).

| Name                                   | Description                                     |
| -------------------------------------- | ----------------------------------------------- |
| Bulk Tuning Dump                       | Tuning dump for all 128 notes                   |
| Scale Octave Tuning (1 byte) (RT/NRT)  | Tuning a single octave, applies to all of them. |
| Scale Octave Tuning (2 bytes) (RT/NRT) | Same as above.                                  |
| Single Note Tuning change (RT/NRT)     | Tunes a single note.                            |

### Portamento Implementation

SpessaSynth attempts to recreate the old Sound Canvas/Yamaha XG portamento behavior.

That is:

- Portamento Time is only 7-bit. (only CC#5 is processed)
- Portamento Control gets overridden with the last portamento key.
- For XG, the initial key to glide from is 60, for other systems there's no initial glide.
- Portamento Time depends on the distance of the keys.
  The final calculation is `portamentoSeconds = portaTimeToRate(cc5) * keyDistance`
- The details of the `portaTimeToRate` function [can be found here.](https://github.com/spessasus/spessasynth_core/blob/master/src/synthesizer/audio_engine/engine_methods/portamento_time.ts)
- If you know a more accurate algorithm, please let me know!
- Portamento is **experimental,** although I found it to be accurate to the S-YXG50 and Sound Canvas VA VSTi instruments.

## Effects

SpessaSynth's effects are modeled after the Sound Canvas line. There are currently 3 effect processors:

- Reverb
- Chorus
- Delay (disabled in XG mode)
