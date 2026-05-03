# MIDIMessage

This class represents a single MIDI message.

## Properties

### ticks

The absolute amount of MIDI Ticks from the start of the track.

### statusByte

The status byte of the message as a number from 0 to 255.

[Learn more here](https://www.recordingblogs.com/wiki/status-byte-of-a-midi-message) [and here](https://www.recordingblogs.com/wiki/midi-meta-messages).

!!! Note

    For Meta Events, the status byte is the SECOND status byte, not the 0xFF!

### data

An `IndexedByteArray`(Pretty much exactly the same as `Uint8Array`) instance of the event's binary data.

!!! Warning

    For System Exclusive events, the data omits the `0xF0` byte as it is already stored in `statusByte`.
    This is very important!
