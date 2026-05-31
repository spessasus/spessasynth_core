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

!!! Tip

    Avoid setting this for drum channels as it may break the drum key mapping.

### fineTune

`number`

The channel tuning in cents.
Drum channels _DO NOT_ ignore this value.

!!! Tip

    While the range of this parameter is unlimited, it is recommended to keep it in the range of -100 to 100 cents.
    The values above that should be applied to `keyShift` instead.
    For example, if the target value is 156, the recommended approach is:
    - `keyShift` = 1
    - `fineTune` = 56
    Note that this approach shouldn't be taken for drum channels, as key shift will break them.

### interpolationType

`InterpolationType?`/`number?` (an enum called `InterpolationTypes` is provided with the library)

The interpolation type used for sample playback.
The interpolation types defined are:

- 0 - linear interpolation - fast, medium quality
- 1 - nearest neighbor interpolation - fastest, but lowest quality (it may be desirable in some cases to make the sound "crispier")
- 2 - Hermite interpolation - slow, high quality (default)

Overrides the global parameter if set.

### nrpnParamLock

`boolean?`

If the channel should prevent changing any parameters via NRPN.

Overrides the global parameter if set.

### monophonicRetrigger

`boolean?`

Indicates whether the channel is in monophonic retrigger mode.
This emulates the behavior of Microsoft GS Wavetable Synth,
Where a new note will kill the previous one if it is still playing.

Overrides the global parameter if set.

## MIDI

MIDI Parameters can only be changed via MIDI messages,
and not via the API. They get reset via MIDI reset messages,
can be locked and have an associated event.

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

The modulation depth in cents.
This is internally converted to a multiplier by dividing by 50.

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

### velocitySenseDepth

`number`

The relation between the input and the actual velocity.

If Velo Depth is increased, small differences in your playing dynamics will make a large difference in the loudness of the sound.
If Velo Depth is decreased, even large differences in your playing dynamics will make only a small difference in the loudness of the sound.

Examples (with offset being set to normal):

- 64 is normal.
- 32 is half velocity at max volume.
- 127 is max velocity at half volume.

Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf), page 56.

### velocitySenseOffset

`number`

The offset to add to the input velocity.

If Velo Offset is set higher than 64, even softly played notes (i.e., notes with a low velocity)
will be sounded loudly. If Velo Offset is set lower than 64,
even strongly played notes (i.e., notes with a high velocity) will be sounded softly.

Examples (with depth set to normal):

- 64 is normal.
- 32 is silent until half velocity, max velocity is half volume.
- 96 starts at half volume and reaches max volume at half velocity.
- 127 always forces velocity to max.

Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf), page 56.
