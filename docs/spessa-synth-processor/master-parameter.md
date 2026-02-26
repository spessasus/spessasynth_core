# Master Parameter

Master parameters can be used to set parameters that affect the entire synthesizer.

They are described below.

### masterGain

`number`

The master gain, from 0 to any number. 1 is 100% volume.

### masterPan

`number`

The master pan, from -1 (hard left) to 1 (hard right). 0 is center.

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

### interpolationType

`number`

The interpolation type used for sample playback.
The interpolation types defined are:

- 0 - linear interpolation - fast, medium quality
- 1 - nearest neighbor interpolation - fastest, but lowest quality (it may be desirable in some cases to make the sound "crispier")
- 2 - hermite interpolation - slow, high quality (default)

!!! Tip

    You can also use the `interpolationTypes` enum.

### midiSystem

`string`

The MIDI system used by the synthesizer for bank selects and system exclusives. (GM, GM2, GS, XG, in lowercase)

### monophonicRetriggerMode

`boolean`

Indicates whether the synthesizer is in monophonic retrigger mode.
This emulates the behavior of Microsoft GS Wavetable Synth,
where a new note will kill the previous one if it is still playing.

### reverbGain

`number`

The reverb gain, from 0 to any number. 1 is 100% reverb.

### reverbLock

`boolean`

If the synthesizer should prevent editing of the reverb parameters.
This effect is modified using MIDI system exclusive messages, so
the recommended use case would be setting
the reverb parameters then locking it to prevent changes by MIDI files.

### chorusGain

`number`

The chorus gain, from 0 to any number. 1 is 100% chorus.

### chorusLock

`boolean`

If the synthesizer should prevent editing of the chorus parameters.
This effect is modified using MIDI system exclusive messages, so
the recommended use case would be setting
the chorus parameters then locking it to prevent changes by MIDI files.

### delayGain

`number`

The delay gain, from 0 to any number. 1 is 100% delay.

### delayLock

`boolean`

If the synthesizer should prevent editing of the delay parameters.
This effect is modified using MIDI system exclusive messages, so
the recommended use case would be setting
the delay parameters then locking it to prevent changes by MIDI files.

### drumLock

`boolean`

If the synthesizer should prevent editing of the drum parameters.
These params are modified using MIDI system exclusive messages or NRPN, so
the recommended use case would be setting
the drum parameters then locking it to prevent changes by MIDI files.

### customVibratoLock

`boolean`

If the synthesizer should prevent applying the custom vibrato.
This effect is modified using NRPN, so
the recommended use case would be setting
the custom vibrato then locking it to prevent changes by MIDI files.
To disable it, make sure that it's unlocked, reset the synthesizer then lock it.

### nprnParamLock

`boolean`

If the synthesizer should prevent changing any parameters via NRPN.
This includes the custom vibrato parameters.

### blackMIDIMode

`boolean`

Forces note killing instead of releasing. Improves performance in black MIDIs.

### transposition

`number`

The global transposition in semitones. It can be decimal to provide microtonal tuning.

### deviceID

`number`

Synthesizer's device ID for system exclusive messages. Set to -1 to accept all by default.

## See also

- [Setting a master parameter](index.md#setmasterparameter)
- [Getting a master parameter](index.md#getmasterparameter)
