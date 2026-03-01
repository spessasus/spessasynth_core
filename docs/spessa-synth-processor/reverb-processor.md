# Reverb Processor

Reverb is an effect that adds reverberation to a sound, as you would hear in a concert
hall.

## Editing the parameters

Editing the parameters can be done via GS system exclusive messages.

Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf) (p.79, 235-236) for more information.

## Custom Processor

`SpessaSynthProcessor` allows you to supply a custom reverb processor.  
A custom reverb processor must implement the following parameters and behavior.

### level

0-127
This parameter sets the amount of the effect sent to the effect output.

### preLowpass

0-7
A low-pass filter can be applied to the sound coming into the effect to cut the high
frequency range. Higher values will cut more of the high frequencies, resulting in a
more mellow effect sound.

### character

0-7.
If character is not available, it should default to the first one.
This parameter selects the type of reverb. 0–5 are reverb effects, and 6 and 7 are delay
effects.

### time

0-127
This parameter sets the time over which the reverberation will continue.
Higher values result in longer reverberation.

### delayFeedback

0-127
This parameter is used when the Reverb Character is set to 6 or 7, or the Reverb Type
is set to Delay or Panning Delay (Rev Character 6, 7). It sets the way in which delays
repeat. Higher values result in more delay repeats.

### preDelayTime

0 - 127 (ms)
This parameter sets the delay time until the reverberant sound is heard.
Higher values result in a longer pre-delay time, simulating a larger reverberant space.

### process

Process the effect and **adds** it to the output.

- input - The input buffer to process. It always starts at index 0.
- outputLeft - The left output buffer.
- outputRight - The right output buffer.
- startIndex - The index to start mixing at into the output buffers.
- sampleCount - The amount of samples to mix.
