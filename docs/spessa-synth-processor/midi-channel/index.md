# MIDIChannel

This class represents a single MIDI channel within a `SpessaSynthProcessor`.

They are accessible through the `midiChannels` property of the synthesizer.

## Methods

### setSystemParameter

Set a [Channel System Parameter.](channel-parameters.md#system)

```ts
channel.setSystemParameter(type, value);
```

- type - the type of the parameter to set, a string of the parameter type.
- value - the value of the parameter to set, depends on the type.

### lockMIDIParameter

Locks or unlocks a given [Channel MIDI Parameter.](channel-parameters.md#midi)
This prevents any changes to it until it's unlocked.

```ts
channel.lockMIDIParameter(parameter, isLocked);
```

- parameter - the Channel MIDI Parameter to lock, a string of the parameter type.
- isLocked - if the parameter should be locked, boolean.

### lockController

Locks or unlocks a given controller.
This prevents any changes to it until it's unlocked.

```ts
channel.lockController(controller, isLocked);
```

- controller - `MIDIController` to lock.
- isLocked - `boolean` if the controller should be locked.

### setDrums

Changes the preset to, or from drums.

```ts
channel.setDrums(isDrum);
```

- isDrum - if the channel should be a drum preset or not.

!!! Note

    This executes a program change.

### stopAllNotes

Stops all notes on the channel.

Parameters:

- force (default false) - If true, stops all notes immediately, otherwise applies release time.

## Properties

### patch

The currently selected [`MIDIPatch`](../midi-patch.md) of this channel.

!!! Note

    The exact matching preset may not be available,
    but this property represents exactly what MIDI asks for.

### preset

The preset currently assigned to the channel.

!!! Note

    This may be undefined in some cases.

This property can be set to directly replace a preset on this channel.

### channel

The channel's number (0-based index)

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

The current [Channel System Parameters](channel-parameters.md#system) of this channel.
These are only editable via the API.

Stored as key: value. Readonly.

### midiParameters

The current [Channel MIDI Parameters](channel-parameters.md#midi) of this channel.
These are only editable via MIDI messages.

Stored as key: value. Readonly.
