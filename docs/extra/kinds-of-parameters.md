---
title: Kinds Of Parameters
---

# Kinds Of Parameters

SpessaSynth recognizes 4 kinds of parameters in the API.
They are all independent of each other,
and parameters at the same level get summed/multiplied
to get the total value for the level.

## Global System Parameters

{@link GlobalSystemParameter See the exact parameters here.}

Global System Parameters are API-only parameters
that affect the entire synthesizer.

They are System Parameters, meaning that they can only be changed via the API,
and not via MIDI messages.

Examples:

- {@link GlobalSystemParameter.voiceCap `voiceCap`}
- {@link GlobalSystemParameter.interpolationType `interpolationType`}

## Global MIDI Parameters

{@link GlobalMIDIParameter See the exact parameters here.}

Global MIDI Parameters are MIDI-only parameters
that affect the entire synthesizer.

They are MIDI Parameters, meaning that they can only be changed via MIDI messages,
and not via the API. They get reset via MIDI reset messages.

They also have an associated event and can be locked.

Examples:

- {@link GlobalMIDIParameter.system `system`}
- {@link GlobalMIDIParameter.keyShift `keyShift`}

## Channel System Parameters

{@link ChannelSystemParameter See the exact parameters here.}

Channel System Parameters are API-only parameters
that affect a single MIDI channel.

Parameters that also appear at
the global level can be overridden at the channel level.

They are System Parameters, meaning that they can only be changed via the API,
and not via MIDI messages.

Examples:

- {@link ChannelSystemParameter.presetLock `presetLock`}
- {@link ChannelSystemParameter.isMuted `isMuted`}

## Channel MIDI Parameters

{@link ChannelMIDIParameter See the exact parameters here.}

Channel MIDI Parameters are MIDI-only parameters
that affect a single MIDI channel.

They are MIDI Parameters, meaning that they can only be changed via MIDI messages,
and not via the API. They get reset via MIDI reset messages.

They also have an associated event and can be locked.

Examples:

- {@link ChannelMIDIParameter.pitchWheel `pitchWheel`}
- {@link ChannelMIDIParameter.pressure `pressure`}
