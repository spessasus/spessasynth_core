# Channel Parameters

These are the parameters that affect the single MIDI channel.

!!! Tip

    Consider reading about [kinds of parameters](../../extra/kinds-of-parameters.md)
    to understand the difference between them.

## System

System Parameters can only be changed via the API,
and not via MIDI messages.

An object called `DEFAULT_CHANNEL_SYSTEM_PARAMETERS` is provided with the library,
containing the defaults.

### presetLock

`boolean`

If the preset is locked, preventing any program changes from being sent.

### isMuted

`boolean`

If the channel should not produce any sound
and ignore incoming Note On messages.

### gain

`number`

The gain for the channel.
From 0 to any number. 1 is 100% volume.

### pan

`number`

The panning of the channel.
-1 (left) to 1 (right). 0 is center.

### keyShift

`number`

The channel key shift in semitones.
Drum channels _DO NOT_ ignore this value.

### fineTune

`number`

The channel tuning in cents.
Drum channels _DO NOT_ ignore this value.

### interpolationType

`InterpolationType?`/`number?` (an enum called `InterpolationTypes` is provided with the library)

The interpolation type used for sample playback.
The interpolation types defined are:

- 0 - linear interpolation - fast, medium quality
- 1 - nearest neighbor interpolation - fastest, but lowest quality (it may be desirable in some cases to make the sound "crispier")
- 2 - Hermite interpolation - slow, high quality (default)

Overrides the global parameter if set.

### customVibratoLock

`boolean?`

If the channel should prevent applying the custom vibrato.
This effect is modified using NRPN, so
the recommended use case would be setting
the custom vibrato then locking it to prevent changes by MIDI files.

Overrides the global parameter if set.

### nrpnParamLock

`boolean?`

If the channel should prevent changing any parameters via NRPN.
This includes the custom vibrato parameters.

Overrides the global parameter if set.

### monophonicRetrigger

`boolean?`

Indicates whether the channel is in monophonic retrigger mode.
This emulates the behavior of Microsoft GS Wavetable Synth,
Where a new note will kill the previous one if it is still playing.

Overrides the global parameter if set.

## MIDI

MIDI Parameters can only be changed via MIDI messages,
and not via the API. They get reset via MIDI reset messages.

An object called `DEFAULT_CHANNEL_MIDI_PARAMETERS` is provided with the library,
containing the defaults.

### pressure

`number`

The current pressure (aftertouch) of this channel.

### pitchWheel

`number`

The current pitch wheel value (0-16,383) of this channel.

### pitchWheelRange

`number`

The current pitch wheel range, in semitones.

### modulationDepth

`number`

The multiplier of the modulation wheel modulator.

The MIDI specification assumes the default modulation depth is 50 cents,
but it may vary for different sound banks.
For example, if a MIDI requests a modulation depth of 100 cents,
the multiplier will be 2,
which, for a preset with a depth of 50,
will create a total modulation depth of 100 cents.

### rxChannel

`number`

The channel's receiving number (0-based index).
This allows triggering multiple parts (channels) with a single note message.

### polyMode

`boolean`

If the channel is in the poly mode.

- `true` - POLY ON - regular playback.
- `false` - MONO ON - one note per channel, others are killed on Note On.

### keyShift

`number`

The channel key shift in semitones.
Drum channels ignore this value.

### fineTune

`number`

The channel tuning in cents.
Drum channels ignore this value.

### randomPan

`boolean`

Enables random panning for every note played on this channel.

### assignMode

`number`

Assign mode for the channel.
`ASSIGN MODE` is the parameter that determines how voice assignment will be handled when sounds overlap on identical note numbers in the same channel (i.e., repeatedly struck notes).
This is initialized to a mode suitable for each Part, so for general purposes there is no need to change this.

- 0 - Single: If the same note is played multiple times in succession, the previously-sounding note will be completely silenced, and then the new note will be sounded.
- 1 - LimitedMulti: If the same note is played multiple times in succession, the previously-sounding note will be continued to a certain extent even after the new note is sounded. (Default setting)
- 2 - FullMulti: If the same note is played multiple times in succession, the previously-sounding note(s) will continue sounding for their natural length even after the new note is sounded.

SpessaSynth treats LimitedMulti like FullMulti.
Essentially Limited and Full are normal
and Single is like `monophonicRetrigger` system parameter.

### efxAssign

`boolean`

Indicates whether this channel uses the insertion EFX processor.

### cc1

`MIDIController`

CC1 for GS controller matrix.
An arbitrary MIDI controller, which can be bound to any synthesis parameter.
Default is 16.

### cc2

`MIDIController`

CC2 for GS controller matrix.
An arbitrary MIDI controller, which can be bound to any synthesis parameter.
Default is 17.

### drumMap

`number`

Drum map for GS system exclusive tracking.
Only used for selecting the correct channel when setting drum parameters through sysEx,
as those don't specify the channel, but the drum number.

The only values that are allowed are 0 (melodic) 1 or 2.
