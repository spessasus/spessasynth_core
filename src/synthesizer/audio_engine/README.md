## This is the synthesis engine folder.

The code here is responsible for a single midi channel, synthesizing the sound to it.

- `engine_methods` contains the methods for the `processor`
- `engine_components` contains the various digital signal processing functions such as the wavetable oscillator, low
  pass filter, etc.

For those interested, `engine_components/dsp/render_voice.ts` file contains the actual DSP synthesis code.
