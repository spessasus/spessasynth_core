# MIDITrack

This class represents a single MIDI track.

## Properties

### name

The name of this track. Empty if the track has no name.

### port

The MIDI port number used by the track.

### channels

A `Set` that contains the MIDI channels used by this track in the sequence.

### events

An array of [MIDI Messages](midi-message.md) in this track, ascending by their tick time.

## Methods

### copyFrom (static)

Copies a track.

```ts
MIDITrack.copyFrom(track);
```

- track - the track to create a copy of.

!!! Note

    This method is *static.*

### copyFrom

Copies a track into this track.

```ts
track.copyFrom(track);
```

- track - the track to copy from.

### addEvent

Adds an event to the track.

```ts
track.addEvent(event, index);
```

- event - the `MIDIMessage` to add.
- index - the index at which to add this event.

### deleteEvent

Removes an event from the track.

```ts
track.deleteEvent(index);
```

- index - the index of the event to remove.

### pushEvent

Appends an event to the end of the track.

```ts
track.pushEvent(event);
```

- event - the event to add.
