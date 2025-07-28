# About Multi-Port MIDI Files

The standard MIDI protocol limits the number of channels to 16 per MIDI port,
which can restrict the versatility of MIDI files.
To overcome this limitation, MIDI supports meta-messages to specify the MIDI port for each track.

## The Meta Message

**Meta Status:** `0x21`  
**Data:** `pp` (Port Number)

!!! Note

    Description adapted from [Mixage Software](https://www.mixagesoftware.com/en/midikit/help/HTML/meta_events.html)

This optional meta-event typically appears at the beginning of a track, before any MIDI events.
It specifies which MIDI port (or bus) the track's events will use.
The data byte `pp` indicates the port number, where `0` corresponds to the first MIDI port in the system.

While the MIDI spec limits each MIDI port to 16 channels (0–15),
multiple ports can be used to extend the number of channels available.
This meta-event allows for distinguishing events on different ports, effectively enabling more channels at once.

!!! Important

    Multiple Port events in a track are acceptable if the track needs to switch ports mid-way.

## SpessaSynth Implementation

[**The code responsible for assigning the ports.
**](https://github.com/spessasus/SpessaSynth/blob/7724bfc6fa67f35741e5778de8c1e4df19dc184d/src/spessasynth_lib/sequencer/worklet_sequencer/song_control.js#L19-L45)

Here is how SpessaSynth handles multi-port MIDI files.
It seems to work with various multi-port files and might be helpful for others implementing this functionality as well.

!!! Note

    This is specific to SpessaSynth’s implementation and may differ in other MIDI tools

1. During MIDI file parsing, assign the detected MIDI ports to each track. If no port is found, use the next track's
   port. If no ports are specified, default to port `0`.

2. When playback starts, assign each port a unique offset, incremented by 16 for each port. For example, if the first
   detected port is `1`, it gets an offset of `0`. The next port gets an offset of `16`, and so on.

3. When assigning offsets to ports, ensure each port has an additional 16 channels. This makes sure that each port has a
   different batch of 16 channels.

4. On encountering a Port Prefix meta-message, update the track’s port to the specified value. Assign an offset to this
   port as described in step 2 if it does not already have one.

5. For voice and system exclusive messages, add the port offset to the channel number to determine the final channel
   used.

!!! Important

    If the MIDI track has MIDI port events, the first port applies to starting from the first event,
    even if the port event is not the first one.
    
    This is a behavior that seems to fix most of musescore's MIDI files.

### Example

- `FF 21 01 00` (Port `0`) - The first track will use channels `0-15`.
- `FF 21 01 01` (Port `1`) - The second track will use channels `16-31`.
