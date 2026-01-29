# The DLS Conversion problem

SpessaSynth supports DLS conversion, but it's limited.
For example:

- only CC7, CC10, CC11, CC92 and CC93 can be modulated in DLS.
- sample offsets cannot be modulated.
- vibLfoToPitch is split up into a separate source and destination in DLS,
  meaning no support for secondary source with this generator as destination.

And most importantly: **only one instrument layer.**

!!! Note

    As of 4.0.0, the DLS parser has been improved and works better than at the time of writing.

This means that the program has to combine all zones from all instruments in a preset **into a single zone list.**
And since soundfont can have up to 2^16 generators, complex sound banks **cannot be converted back from DLS into SF2.**
SpessaSynth tries to put as many generators as it can into the global zone to decrease the count,
but it does not always work.
Note that it can read these large DLS files without issue, converting them back into SF2 is the problem.

Also, there is simply a lack of documentation or software to test with. The only ones I am aware of are:

- fluidsynth & Swami (both use libinstpatch)
- SynthFont Viena
- SonivoxEAS
- Awave Studio
- Extreme Sample Converter
- Audio Compositor
- Microsoft Direct Music Producer
- Nullsoft MIDI player (Winamp). This seems to use Microsoft's official DLS synth.

I was testing my soundfonts with my own program, like this:
sf2 → DLS → sf2
then opening them in Polyphone.
