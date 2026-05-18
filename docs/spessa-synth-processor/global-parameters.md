# Global Parameters

These are the parameters that affect the entire synthesizer.

!!! Tip

    Consider reading about [kinds of parameters](../extra/kinds-of-parameters.md)
    to understand the difference between them.

## System

System Parameters can only be changed via the API,
and not via MIDI messages.

An object called `DEFAULT_GLOBAL_SYSTEM_PARAMETERS` is provided with the library,
containing the defaults.

### effectsEnabled

`boolean`

If the synthesizer processes the audio effects.

### eventsEnabled

`boolean`

If the event system is enabled.

### voiceCap

`number`

The maximum number of voices that can be played at once.

!!! Warning

    Increasing this value causes memory allocation for more voices.
    It is recommended to set it at the beginning, before rendering audio to avoid GC.
    Decreasing it does not cause memory usage change, so it's fine to use.

### autoAllocateVoices

`boolean`

Enabling this parameter will cause a new voice allocation when the voice cap is hit,
rather than stealing existing voices.

!!! Warning

    This is not recommended in real-time environments.

### reverbGain

`number`

The reverb effect gain.
From 0 to any number. 1 is 100% reverb.

### reverbLock

`boolean`

If the synthesizer should prevent editing of the reverb parameters.
This effect is modified using MIDI system exclusive messages, so
the recommended use case would be setting
the reverb parameters then locking it to prevent changes by MIDI files.

### chorusGain

`number`

The chorus effect gain.
From 0 to any number. 1 is 100% chorus.

### chorusLock

`boolean`

If the synthesizer should prevent editing of the chorus parameters.
This effect is modified using MIDI system exclusive messages, so
the recommended use case would be setting
the chorus parameters then locking it to prevent changes by MIDI files.

### delayGain

`number`

The delay effect gain.
From 0 to any number. 1 is 100% delay.

### delayLock

`boolean`

If the synthesizer should prevent editing of the delay parameters.
This effect is modified using MIDI system exclusive messages, so
the recommended use case would be setting
the delay parameters then locking it to prevent changes by MIDI files.

### insertionEffectLock

`boolean`

If the synthesizer should prevent changing the insertion effect type and parameters (including enabling/disabling it on channels).
This effect is modified using MIDI system exclusive messages, so
the recommended use case would be setting
the insertion effect type and parameters then locking it to prevent changes by MIDI files.

### drumLock

`boolean`

If the synthesizer should prevent editing of the drum parameters.
These params are modified using MIDI system exclusive messages or NRPN, so
the recommended use case would be setting
the drum parameters then locking it to prevent changes by MIDI files.

### blackMIDIMode

`boolean`

Forces note killing instead of releasing. Improves performance in black MIDIs.

### deviceID

`number`

Synthesizer's device ID for system exclusive messages.
Set to -1 to accept all messages.

### gain

`number`

The master gain.
From 0 to any number. 1 is 100% volume.

### pan

`number`

The master pan.
From -1 (left) to 1 (right). 0 is center.

### keyShift

`number`

The global key shift in semitones.
Drum channels ignore this value.

### fineTune

The global tuning in cents.
Drum channels ignore this value.

### interpolationType

`InterpolationType`/`number` (an enum called `InterpolationTypes` is provided with the library)

The interpolation type used for sample playback.
The interpolation types defined are:

- 0 - linear interpolation - fast, medium quality
- 1 - nearest neighbor interpolation - fastest, but lowest quality (it may be desirable in some cases to make the sound "crispier")
- 2 - Hermite interpolation - slow, high quality (default)

### nrpnParamLock

`boolean`

If the synthesizer should prevent changing any parameters via NRPN.

### monophonicRetrigger

`boolean`

Indicates whether the synthesizer is in monophonic retrigger mode.
This emulates the behavior of Microsoft GS Wavetable Synth,
Where a new note will kill the previous one if it is still playing.

## MIDI

MIDI Parameters can only be changed via MIDI messages,
and not via the API. They get reset via MIDI reset messages.

An object called `DEFAULT_GLOBAL_MIDI_PARAMETERS` is provided with the library,
containing the defaults.

### system

`MIDISystem`

The currently enabled MIDI system used by the synthesizer for bank selects and system exclusives.
`gm`, `gm2`, `gs`, `xg`
Set by MIDI SysEx.

### keyShift

`number`

The global key shift in semitones.
Drum channels ignore this value.

### fineTune

`number`

The global tuning in cents.
Drum channels ignore this value.

### gain

`number`

The master gain.
From 0 to any number. 1 is 100% volume.

### pan

`number`

The master pan.
From -1 (left) to 1 (right). 0 is center.
