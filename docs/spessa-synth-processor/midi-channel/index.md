# MIDIChannel

This class represents a single MIDI channel within a `SpessaSynthProcessor`.

## Methods

### resetPreset

Resets the preset to the default value.

### resetRP15

Resets controllers according to [RP-15 Recommended Practice.](https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf)

### resetParameters

Reset all parameters to their default values.
This includes NRPN and RPN controllers, data entry state,
and generator overrides and offsets.

### dataEntryFine

Executes a data entry fine (LSB) change for the current channel.

Parameters:

- dataValue - The value to set for the data entry fine controller (0-127).

### dataEntry

Executes a data entry coarse (MSB) change for the current channel.

Parameters:

- dataValue - The value to set for the data entry coarse controller (0-127).

### transposeChannel

Transposes the channel by given amount of semitones.

Parameters:

- semitones - The number of semitones to transpose the channel by. Can be decimal.
- force - Defaults to false, if true, it will force the transpose even if the channel is a drum channel.

### setOctaveTuning

Sets the octave tuning for a given channel.

Parameters:

- tuning - the tuning array of 12 values, each representing the tuning for a note in the octave.

!!! Note

    Cent tunings are relative.

### modulationDepth

Sets the modulation depth for the channel.

Parameters:

- cents - The modulation depth in cents to set.

!!! Note

    This method sets the modulation depth for the channel by converting the given cents value into a
    multiplier. The MIDI specification assumes the default modulation depth is 50 cents,
    but it may vary for different sound banks.
    For example, if you want a modulation depth of 100 cents,
    the multiplier will be 2,
    which, for a preset with a depth of 50,
    will create a total modulation depth of 100 cents.

### fineTune

Sets the channel's tuning.

Parameters:

- cents - The tuning in cents to set.
- log - If true, logs the change to the console.

### setPresetLock

Locks or unlocks the preset from MIDI program changes.

Parameters:

locked - If the preset should be locked.

### setDrums

Changes the preset to, or from drums.

Parameters:

- isDrum - if the channel should be a drum preset or not.

!!! Note

    This executes a program change.

### setPatch

Sets the channel to a given MIDI patch.

Parameters:

- patch - the [MIDI Patch](../midi-patch.md) to set the channel to.

!!! Note

    This executes a program change.

### setGSDrums

Sets the GM/GS drum flag.

Parameters:

- drums - the new flag value.

### killNote

Stops a note nearly instantly.

Parameters:

- midiNote - the note to stop
- releaseTime (defaults to -12000) - the release time of the note.

### stopAllNotes

Stops all notes on the channel.

Parameters:

- force (default false) - If true, stops all notes immediately, otherwise applies release time.

### muteChannel

Mutes or unmutes a channel.

Parameters:

- isMuted - if the channel should be muted.

### applySnapshot

Applies a channel snapshot to this channel.

```ts
channel.applySnapshot(snapshot);
```

- snapshot - the `ChannelSnapshot` to apply.

### getSnapshot

Returns a `ChannelSnapshot` of this channel's current state.

```ts
const snapshot = channel.getSnapshot();
```

## Properties

### patch

The currently selected [`MIDIPatch`](../midi-patch.md) of this channel.

!!! Note

    The exact matching preset may not be available,
    but this property represents exactly what MIDI asks for.

### voiceCount

Current amount of voices that are playing on this channel.

### drumChannel

Indicates whether this channel is a drum channel.

### midiControllers

An array of MIDI controllers for the channel.
This array is used to store the state of various MIDI controllers
such as volume, pan, modulation, etc.

!!! Note

    A bit of an explanation:
    The controller table is stored as an `Int16Array`,
    it stores 14-bit values, allowing for full 14-bit LSB resolution.
    The only exception from this are
    the Registered and Non-Registered Parameter Numbers.
    Data entries do store it!

!!! Warning

    Readonly, do not modify directly!

### systemParameters

The channel's current [System Parameters](channel-parameters.md)

### midiParameters

`Readonly<ChannelMIDIParameter>` - The channel's MIDI parameters.
