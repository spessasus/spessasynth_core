---
title: About Multi-Port MIDI Files
---

# About Multi-Port MIDI Files

The standard MIDI protocol limits the number of channels to 16 per MIDI port,
which can restrict the versatility of MIDI files.
To overcome this limitation, MIDI supports meta-messages to specify the MIDI port for each track.

## The Meta Message

**Meta Status:** `0x21`  
**Data:** `pp` (Port Number)

> **Note**
>
> Description adapted from [Mixage Software](https://www.mixagesoftware.com/en/midikit/help/HTML/meta_events.html)

This optional meta-event typically appears at the beginning of a track, before any MIDI events.
It specifies which MIDI port (or bus) the track's events will use.
The data byte `pp` indicates the port number, where `0` corresponds to the first MIDI port in the system.

While the MIDI spec limits each MIDI port to 16 channels (0–15),
multiple ports can be used to extend the number of channels available.
This meta-event allows for distinguishing events on different ports, effectively enabling more channels at once.

> **Important**
>
> Multiple Port events in a track are acceptable if the track needs to switch ports mid-way.

## SpessaSynth Implementation

The ports are detected when the MIDI file is parsed ({@link BasicMIDI.portChannelOffsetMap})
and the {@link SpessaSynthSequencer} adds the synthesizer channels for them when the file is loaded.

Consider reviewing the code responsible for them for details.

Here is how SpessaSynth handles multi-port MIDI files.
It seems to work with various multi-port files and might be helpful for others implementing this functionality as well.

> **Note**
>
> This is specific to SpessaSynth’s implementation and may differ in other MIDI tools.

1. During MIDI file parsing, assign each track the port of its first Port Prefix meta-message.
   Tracks without notes get their port too, they often hold the channel setup (MuseScore writes it that way).
2. If no track with notes has a port event, attempt to detect the ports from the track names:
   `A<num>` or `PartA` is port `0`, `B<num>` or `PartB` is port `1`, and so on up to `D`.
   **This is a different method of achieving multiple ports and MIDI files that use it do not use the meta message.**
3. Tracks without a port use the lowest port that plays notes. If no ports are found at all, default to port `0`.
   If no track with notes has a port, the port numbers say nothing about routing and every port uses the first 16 channels.
4. Give each port that plays notes a unique channel offset, incremented by 16 for each port:
   first the starting ports the tracks play notes on (in track order), then the other ports in the time order of their first note.
   For example, if the first detected port is `1`, it gets an offset of `0`. The next port gets an offset of `16`, and so on.
5. When loading the file, add 16 channels to the synthesizer for every port that does not fit into the existing channels.
6. On encountering a Port Prefix meta-message, switch the track to the specified port.
7. For voice and system exclusive messages, add the port offset to the channel number to determine the final channel used.
8. A port without any notes gets no channels: its voice messages and part-specific system exclusive messages are dropped.
   Global system exclusive messages (resets, master settings) still apply,
   where a reset received on any port resets the whole device.

> **Important**
>
> If the MIDI track has MIDI port events, the track starts on its first declared port from its very first event,
> even if the port event is not the first one, then switches when the next port events are encountered.
>
> This is a behavior that fixes MuseScore's MIDI files, which write the port event after the channel setup it applies to.

### Example

- `FF 21 01 00` (Port `0`) - The first track will use channels `0-15`.
- `FF 21 01 01` (Port `1`) - The second track will use channels `16-31`.
