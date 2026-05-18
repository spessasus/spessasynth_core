# Kinds Of Parameters

SpessaSynth recognizes 4 kinds of parameters in the API.
They are all independent of each other,
and parameters at the same level get summed/multiplied
to get the total value for the level.

## Global

These parameters affect the entire synthesizer.

### System Parameters

[See the exact parameters here](../spessa-synth-processor/global-parameters.md#system)

Global System Parameters are API-only parameters
that affect the entire synthesizer.

They are System Parameters, meaning that they can only be changed via the API,
and not via MIDI messages.

Examples:

- `voiceCap`
- `interpolationType`

### MIDI Parameters

[See the exact parameters here](../spessa-synth-processor/global-parameters.md#midi)

Global MIDI Parameters are MIDI-only parameters
that affect the entire synthesizer.

They are MIDI Parameters, meaning that they can only be changed via MIDI messages,
and not via the API. They get reset via MIDI reset messages.

They also have an associated event.

Examples:

- `system`
- `keyShift`

## Channel

These parameters affect a single MIDI channel.

### System Parameters

[See the exact parameters here](../spessa-synth-processor/midi-channel/channel-parameters.md#system)

Channel System Parameters are API-only parameters
that affect a single MIDI channel.

Parameters that also appear at
the global level can be overridden at the channel level.

They are System Parameters, meaning that they can only be changed via the API,
and not via MIDI messages.

Examples:

- `presetLock`
- `isMuted`

### MIDI Parameters

[See the exact parameters here](../spessa-synth-processor/midi-channel/channel-parameters.md#midi)

Channel MIDI Parameters are MIDI-only parameters
that affect a single MIDI channel.

They are MIDI Parameters, meaning that they can only be changed via MIDI messages,
and not via the API. They get reset via MIDI reset messages.

They also have an associated event.

Examples:

- `pitchWheel`
- `pressure`
