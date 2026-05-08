## This is the synthesis engine folder.

The code here is responsible for a single midi channel, synthesizing the sound to it.

- `channel` - a single MIDI channel (part) implementation.
- `effects` - the audio effects: Reverb, Chorus, Delay, Insertion.
- `snapshot` - `SynthesizerSnapshot` and `ChannelSnapshot` implementation.
- `system_exclusive` - MIDI System Exclusive message parser.
- `voice` - a single voice structure.

For those interested, `channel/render_voice.ts` file contains the actual DSP synthesis code.
