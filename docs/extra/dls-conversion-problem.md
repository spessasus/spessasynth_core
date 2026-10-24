---
title: The DLS Conversion problem
---

# The DLS Conversion problem

> **Note**
>
> The DLS parser has been improved and works better than at the time of writing,
> but the limitations described here still apply.

SpessaSynth supports converting between SF2 and DLS, but the conversion is limited by the differences between the formats.
For example, in DLS:

- Only CC1, CC7, CC10, CC11, CC91 and CC93 can be modulated.
- Sample offsets cannot be modulated.
- Vibrato LFO to pitch is split up into a separate source and destination,
  meaning no support for a secondary source with this generator as the destination.

And most importantly: **there is only one instrument layer.**

This means that when converting SF2 to DLS, the program has to combine all zones from all instruments in a preset
**into a single zone list.**
And since an SF2 file can have up to 2^16 generators, complex sound banks **cannot be converted back from DLS into SF2.**
SpessaSynth tries to put as many generators as it can into the global zone to decrease the count,
but it does not always work.

It can read these large DLS files without issue, but converting them back into SF2 is the problem.

Also, there is simply a lack of documentation or software to test with. The only ones I am aware of are:

- FluidSynth & Swami (both use libinstpatch)
- SynthFont Viena
- SonivoxEAS
- Awave Studio
- Extreme Sample Converter
- Audio Compositor
- Microsoft Direct Music Producer
- Nullsoft MIDI player (Winamp). This seems to use Microsoft's official DLS synth.

I was testing my sound banks with my own program, like this:
SF2 → DLS → SF2,
then opening them in Polyphone.
