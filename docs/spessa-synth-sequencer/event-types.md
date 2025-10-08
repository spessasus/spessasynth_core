# Event Types

This page serves as a detailed reference to all the event types `SpessaSynthSequencer` emits.


## Detailed descriptions

Each event has an object with data for this event.
The lists list properties of the object.

### midiMessage

Called when a MIDI message is sent and externalMIDIPlayback is true.

- message: number[] - the binary MIDI message

### timeChange

Called when the time is changed.
It also gets called when a song gets changed.
    
- newTime: number - the new time in seconds.

### songEnded

Called when the song has finished playing.

An empty object is returned for now.

### pause


!!! Danger

    This event is *deprecated*. Please use `songEnded` instead, for parity with spessasynth_lib.

Called when the playback stops.

- isFinished: boolean - true if the playback stopped because it finished playing the song, false if it was stopped manually.

### songChange

Called when the song changes.

- songIndex - the index of the new song in the song list.

### songListChange

Called when the song list changes.

- newSongList: BasicMIDI[] - The new song list.

### metaEvent

Called when a MIDI Meta event is encountered.

- event: MIDIMessage - the MIDI message of the meta event.
- trackIndex: number - the index of the track where the meta event was encountered.

### loopCountChange

Called when the loop count changes (decreases).

- newCount: number - the new loop count.