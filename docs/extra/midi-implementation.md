# MIDI Implementation

This describes what messages SpessaSynth can receive.

[Here is a useful resource about the MIDI standard. It's in japanese, but all the PDFs are english.](https://amei.or.jp/midistandardcommittee/RP&CAj.html)

## Supported MIDI Messages

!!! Note

     ⚠️NON-STANDARD!⚠️ means that this is an additional modulator that is not specified in the SF2 specification.

| Message           | Supported? | Notes                                                                          |
|-------------------|------------|--------------------------------------------------------------------------------|
| Note On           | ✔️         |                                                                                |
| Note Off          | ✔️         | Does not support note off velocity (Per SF2 specification)                     |
| Note Aftertouch   | ✔️         | 50 cents of vibrato ⚠️NON-STANDARD!⚠️                                          |
| Controller Change | ✔️         | [See below](#default-supported-controllers)                                    |
| Program Change    | ✔️         | GM, GM2, GS, XG                                                                |
| Channel Pressure  | ✔️         | 50 cents of vibrato                                                            |
| Pitch Wheel       | ✔️         | Controlled by Pitch Wheel range (both semitones and cents)                     |
| System exclusive  | ✔️         | [See below](#supported-system-exclusives)                                      |
| Time Code         | ❌          | Not Applicable                                                                 |
| Song Position     | ❌          | Not Applicable                                                                 |
| Song Select       | ❌          | Not Applicable                                                                 |
| Tune Request      | ❌          | Not Applicable                                                                 |
| MIDI Clock        | ❌          | Not Applicable                                                                 |
| MIDI Start        | ❌          | Not Applicable                                                                 |
| MIDI Continue     | ❌          | Not Applicable                                                                 |
| MIDI Stop         | ❌          | Not Applicable                                                                 |
| Active Sense      | ❌          | Not Applicable                                                                 |
| System Reset      | ✔️         | Can only be received via MIDI ports as 0xFF in MIDI files means a meta message |

## Controllers

### Default Supported Controllers

Below is the list of controllers supported by default.
!!! Note

    Theoretically all controllers are supported as it depends on the SoundFont's modulators. These are the controllers that are supported by default/have default modulators.

!!! Note

    For more info, see [default modulators](../sound-bank/modulator.md#default-modulators)

| CC                   | Controller name                     | Value                                                                                                    | Explanation                                                                                                                                                            | Default value |
|----------------------|-------------------------------------|----------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| 0                    | Bank Select                         | The bank number (0 - 127)                                                                                | Changes the bank number that is used in programChange. Note that it doesn't change the preset on its own. [See this for more info](#supported-bank-systems)            | 0             |
| 1                    | Modulation Wheel                    | The modulation depth (0 - 127) mapped to max 50 cents of detune                                          | Controls the vibrato for the given patch.                                                                                                                              | 0             |
| 5                    | Portamento Time                     | The portamento time (0 - 127)                                                                            | Controls the portamento time. [See portamento implementation](#portamento-implementation) A value of 0 effectively disables portamento.                                | 0             |
| 6                    | Data Entry MSB                      | Data entry value (0 - 127)                                                                               | This sets the selected RP or NRP to the given value. Note that the RPN and NRPN controllers only select the parameter, while this controller actually sets the values. | none          |
| 7                    | Main Volume                         | The volume (0 - 127) 0 is silent, 127 is normal volume                                                   | Changes the channel's volume.                                                                                                                                          | 100           |
| 10                   | Pan                                 | 0 is left, 64 is middle, 127 is right                                                                    | Controls the channel's stereo balance                                                                                                                                  | 64            |
| 11                   | Expression controller               | The expression (0 - 127) 0 is silent, 127 is normal volume                                               | Works exactly like Main Volume, but it's independent.                                                                                                                  | 127           |
| 32                   | Bank Select LSB                     | The bank number (0 - 127)                                                                                | Changes the bank number that is used in programChange. Note that it doesn't change the preset on its own. [See this for more info](#supported-bank-systems)            | 0             |
| 33 - 64 excluding 38 | Controller LSB values               | The lower nibble of the value (0 - 127)                                                                  | Allows precise control of values such as volume, expression, pan. Extends the precision from 0 - 127 to 0 - 16384 (!)                                                  | 0             |
| 38                   | Data Entry LSB                      | Data entry value (0 - 127)                                                                               | This sets the selected RP or NRP to the given value. Note that the RPN and NRPN controllers only select the parameter, while this controller actually sets the values. | none          |
| 64                   | Sustain Pedal                       | 0 - 63 is off, 64 - 127 is on                                                                            | Holds the noteOff messages until the pedal is off, then stops them all at once.                                                                                        | 0 (off)       |
| 65                   | Portamento On/Off                   | 0 - 63 is off, 64 - 127 is on                                                                            | Controls if the portamento is enabled or not.                                                                                                                          | on            |
| 71                   | Filter Resonance                    | The resonance (0 - 127) 0 is 25 dB less, 64 is unchanged, 127 is 25 dB more          ⚠️NON-STANDARD!⚠️   | Controls the filter resonance of the given patch.                                                                                                                      | 64            |
| 72                   | Attack Time                         | The attack time (0- 127) 64 is normal, 0 is the fastest, 127 is the slowest          ⚠️NON-STANDARD!⚠️   | Controls the attack time for the given patch.                                                                                                                          | 64            |
| 73                   | Release Time                        | The release time (0- 127) 64 is normal, 0 is the fastest, 127 is the slowest         ⚠️NON-STANDARD!⚠️   | Controls the release time for the given patch.                                                                                                                         | 64            |
| 74                   | Brightness                          | The brightness (0 - 127) 0 is muffled, 64 is no additional filter, 127 is most clear ⚠️NON-STANDARD!⚠️   | Controls the brightness (lowpass frequency) of the given patch.                                                                                                        | 64            |
| 84                   | Portamento Control                  | The key number glide should start from (0 - 127)                                                         | Controls the portamento target key. [See portamento implementation](#portamento-implementation)                                                                        | 0             |
| 91                   | Effects 1 Depth (reverb)            | The reverb depth (0 - 127) [See important info](../sound-bank/modulator.md#reverb-and-chorus-modulators) | Controls the reverb effect send for the given channel.                                                                                                                 | 0             |
| 92                   | Effects 2 Depth (tremolo)           | The tremolo depth (0 - 127) mapped to 25dB of loudness variation                     ⚠️NON-STANDARD!⚠️   | Controls the tremolo (trembling) effect for the given patch.                                                                                                           | 0             |
| 93                   | Effects 3 Depth (chorus)            | The chorus depth (0 - 127) [See important info](../sound-bank/modulator.md#reverb-and-chorus-modulators) | Controls the chorus effect for the given channel.                                                                                                                      | 0             |
| 99                   | Non-Registered Parameter Number MSB | Parameter number (0 - 127)                                                                               | Selects a Non-Registered Parameter's Coarse to the given value. [Here are the currently supported values.](#supported-non-registered-parameters).                      | none          |
| 98                   | Non-Registered Parameter Number LSB | Parameter number (0 - 127)                                                                               | Selects a Non-Registered Parameter's Fine to the given value. [Here are the currently supported values.](#supported-non-registered-parameters).                        | none          |
| 100                  | Registered Parameter Number LSB     | Parameter number (0 - 127)                                                                               | Selects a Registered Parameter's Fine to the given value. [Here are the currently supported values.](#supported-registered-parameters).                                | none          |
| 101                  | Registered Parameter Number MSB     | Parameter number (0 - 127)                                                                               | Selects a Registered Parameter's Coarse to the given value. [Here are the currently supported values.](#supported-registered-parameters).                              | none          |
| 120 or 123           | All Notes Off or All Sound Off      | Not Applicable                                                                                           | Stops all the notes. Equivalent to MIDI "panic".                                                                                                                       | N.A.          |
| 121                  | Reset All Controllers               | Not Applicable                                                                                           | Resets all controllers to their default values.                                                                                                                        | N.A.          |

### Default controller values

!!! Important

    "Reset All Controllers" (CC#121) is implemented according
    to [RP-15 recommended practice.](https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf)

Below are all the controller values which are not zero when the controllers are reset.

| CC Number | Name                         | Reset Value |
|-----------|------------------------------|-------------|
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

## Parameter Numbers

### Supported Registered Parameters

Below is the list of currently implemented Registered Parameters.

| RPN MSB | RPN LSB | Name                     | Explanation                                                                                                                                                                                                                                                    | Default                      |
|---------|---------|--------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------|
| 0       | 0       | Pitch Wheel range        | The range in semitones of the `synth.pitchWheel()` method.                                                                                                                                                                                                     | 2 semitones                  |
| 0       | 2       | Channel Coarse Tuning    | The channel's tuning in semitones                                                                                                                                                                                                                              | No tuning (0 semitones)      |
| 0       | 3       | Channel Fine Tuning      | The channel's tuning, like a pitch bend message (precise tuning in 2 semitones)                                                                                                                                                                                | No tuning (0 cents)          |
| 0       | 5       | Channel Modulation Depth | The channel's modulation (vibrato) depth. Note that this doesn't set the cents directly, but rather scales the soundfont modulator value (for example if set to twice the MIDI default value, the modulator controlling vibrato depth will be multiplied by 2) | default sf2 depth (50 cents) |
| 127     | 127     | Reset parameters         | Resets all parameters                                                                                                                                                                                                                                          | N.A.                         |

### Supported Non-Registered Parameters

Below is the list of currently implemented Non-Registered Parameters.
Note that all these are non-standard GM.
**These only apply for GS**

| NRPN MSB | NRPN LSB | Name              | Explanation                                                                                 | Default        |
|----------|----------|-------------------|---------------------------------------------------------------------------------------------|----------------|
| 0x1      | 0x8      | Vibrato rate      | Controls the vibrato rate. The calculation to hertz is as follows: `hz = (value / 64) * 8`  | 0 (disabled)   |
| 0x1      | 0x9      | Vibrato depth     | Controls the vibrato depth. Depth in cents is as calculated as follows: `cents = value / 2` | 0 (disabled)   |
| 0x1      | 0xA      | Vibrato delay     | Controls the vibrato delay. Calculation to seconds is as follows: `s = (64 / value) / 3`    | 0 (disabled)   |
| 0x1      | 0x20     | TVF Filter Cutoff | Controls the filter cutoff using the CC 74 (brightness)                                     | 64 (no change) |
| 0x01     | 0x66     | EG Release Time   | Controls the volume envelope release time using CC 72                                       | 64 (no change) |
| 0x01     | 0x64     | EG Attack Time    | Controls the volume envelope attack time using CC 73                                        | 64 (no change) |

#### Custom Vibrato

The NPRN vibrato messages have special behavior.
Any value other than 64 received for any of the states activates it with the default settings:

- depth = 50 cents
- rate = 8 Hz
- delay = 0.6s

After which any changes received through the NRPN (including the one that triggered it) are enabled.
This behavior has existed since the beginning of this program as a way to enhance the TH MIDI files,
the original target of SpessaSynth.

**It is disabled for any channel that has CC#1 (Mod Wheel) set to anything other than 0.**
This can be useful as setting CC#1 to something like 1 (which is usually imperceptible), 
will fully disable the extra vibrato.

[Custom vibrato can be fully disabled as well.](https://github.com/spessasus/spessasynth_lib/blob/b0716295820fc6b2e8873a1b0871ca6a0266ea02/src/synthetizer/worklet_processor.js#L281-L292)

#### SoundFont2 NRPN

As of 3.26.15, spessasynth supports the standard SF2 NRPN implementation.

#### AWE32 NRPN Compatibility Layer

As of 3.26.11, spessasynth supports emulation of the AWE32 NRPN generator modification.
The parameter interpretation is similar to fluidsynth's emulation,
as it has been tested and found relatively accurate to the sound cards.
Here are some useful resources about this:

- [AWE32 Frequently Asked Questions](http://archive.gamedev.net/archive/reference/articles/article445.html)
- [AWE32 Developer's Information Pack](https://github.com/user-attachments/files/15757220/adip301.pdf)
- [S. Christian Collins's AWE32 MIDI Conversion Repository](https://github.com/mrbumpy409/AWE32-midi-conversions)
- [S. Christian Collins's AWE32 NRPN Filter Tests](https://github.com/mrbumpy409/SoundFont-Spec-Test/tree/main/NRPN%20test%20-%20filter)
- [Fluidsynth AWE32 NPRN implementation](https://github.com/FluidSynth/fluidsynth/wiki/FluidFeatures#nrpn-control-change-implementation-chart)

There are a few differences from fluidsynth's implementation:

- LSB 16 overrides the `fineTune` generator instead of emitting a pitch-wheel event
- Effect generators get overridden directly rather than passing through the modulator
- Filter cutoff and Q have been tuned slightly differently

## System Exclusives

### Supported System Exclusives

Below is the list of currently implemented System Exclusive messages.

| Name                   | Description                                                                       |
|------------------------|-----------------------------------------------------------------------------------|
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
| XG Master Volume       | Controls the overall synth's volume.                                              |
| XG Master Transpose    | Controls the overall synth's transposition.                                       |
| XG Part Setup          | See [this for more info](#xg-part-setup)                                          |
| MIDI Tuning Standard   | See [this for more info](#midi-tuning-standard)                                   |

### Supported Bank systems

See the [MIDI Patch system](../spessa-synth-processor/midi-patch.md) for more information.

#### GM

General MIDI (Level 1).

Ignores all bank-selects.

#### GS

Roland GS, default. 

Bank MSB processed directly, LSB is ignored.
SysEx can be used to turn a channel into a drum channel.


#### GM2

General MIDI Level 2.

Bank LSB and MSB are processed. 
MSB can be used to turn a channel into a drum channel.
Drums will be selected according to the [XG Validity](../spessa-synth-processor/midi-patch.md#xg-validity)

#### XG

Yamaha XG.

Bank LSB and MSB are processed. 
MSB can be used to turn a channel into a drum channel.
Drums will be selected according to the [XG Validity](../spessa-synth-processor/midi-patch.md#xg-validity)

### GS Parameters

Below are the supported GS SysEx Parameters.

| Name                    | Description                                                                      |
|-------------------------|----------------------------------------------------------------------------------|
| Use for drums part      | Turns a specified channel into a drum channel.                                   |
| Master Pan              | Controls the overall synth's stereo panning.                                     |
| Master Volume           | Controls the overall synth's volume.                                             | 
| Master Reverb           | Controls the overall synth's reverb level.                                       | 
| Master Chorus           | Controls the overall synth's chorus level.                                       | 
| Key Shift               | Transposes the keys by a given amount.                                           |
| Reverb Level            | Same as CC 91 (reverb depth)                                                     | 
| Chorus Level            | Same as CC 92 (chorus depth)                                                     |
| Pan Position            | Same as CC 10 (pan position) except 0 mean random pan for every voice.           | 
| Scale Tuning            | Similar to MTS Scale Octave Tuning.                                              |
| Controller to Parameter | Defines how a controller affects the sound. See page 198 of the SC-88Pro Manual. |

### XG Part Setup

Below are the supported part setup messages for XG.

| Number (hex) | Name                              |
|--------------|-----------------------------------|
| 01           | Bank Select MSB                   |
| 02           | Bank Select LSB                   |
| 03           | Program change                    |
| 0B           | Volume                            |
| 0E           | Pan (0 is random for every voice) |
| 13           | Reverb                            |
| 12           | Chorus                            |

### MIDI Tuning Standard

Below are the supported sysExes of the MTS.
RT means realtime and NRT means non-realtime.

- Bulk Tuning Dump
- Scale Octave Tuning (1 byte) (RT/NRT)
- Scale Octave Tuning (2 bytes) (RT/NRT)
- Single Note Tuning change (RT)
- Single Note Tuning Change (RT/NRT)

### Portamento Implementation

SpessaSynth attempts to mimic the old SC-55 Portamento behavior.

That is:

- Portamento Time is only 7-bit.
- Portamento Control gets overridden with the last portamento key.
- Portamento Time uses
  the [following table by John Novak](https://github.com/dosbox-staging/dosbox-staging/pull/2705#issue-1827830020) and
  linearly interpolates it.
- Portamento Time depends on the distance of the keys.
  The final calculation is `portamentoSeconds = linearInterpolateTable(portamentoTime) * keyDistance / 36` for now.
  If you know a more accurate algorithm, please let me know!
- Portamento is **experimental.** It can be disabled, and it may not work correctly as I do not own an actual SC-55 to
  test it with.