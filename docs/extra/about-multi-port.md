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
and assigned to the synthesizer channels by the {@link SpessaSynthSequencer} during playback.

Consider reviewing the code responsible for them for details.

Here is how SpessaSynth handles multi-port MIDI files.
It seems to work with various multi-port files and might be helpful for others implementing this functionality as well.

> **Note**
>
> This is specific to SpessaSynth’s implementation and may differ in other MIDI tools.

1. During MIDI file parsing, assign the detected MIDI port to each track. Tracks without any channel messages are skipped.
2. If no port events are found, attempt to detect the ports from the track names:
   `A<num>` or `PartA` is port `0`, `B<num>` or `PartB` is port `1`, and so on up to `D`.
   **This is a different method of achieving multiple ports and MIDI files that use it do not use the meta message.**
3. Tracks without a port use the lowest port found in the file. If no ports are found at all, default to port `0`.
4. Assign each port a unique channel offset, incremented by 16 for each port, in the order the ports are first encountered.
   For example, if the first detected port is `1`, it gets an offset of `0`. The next port gets an offset of `16`, and so on.
5. During playback, add 16 more channels to the synthesizer for every new port that does not fit into the existing channels.
6. On encountering a Port Prefix meta-message, update the track’s port to the specified value.
   Assign an offset to this port as described in step 4 if it does not already have one.
7. For voice and system exclusive messages, add the port offset to the channel number to determine the final channel used.

> **Important**
>
> If the MIDI track has MIDI port events, the track starts on the declared port from its very first event,
> even if the port event is not the first one.
> If a track declares multiple ports, it starts on the last one, then switches when the port events are encountered.
>
> This is a behavior that seems to fix most of MuseScore's MIDI files.

### Example

- `FF 21 01 00` (Port `0`) - The first track will use channels `0-15`.
- `FF 21 01 01` (Port `1`) - The second track will use channels `16-31`.
