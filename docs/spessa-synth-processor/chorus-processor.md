# Chorus Processor

Chorus broadens the spatial image of the sound, adding depth and richness.

## Editing the parameters

Editing the parameters can be done via GS system exclusive messages.

Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf) (p.79, 235-236) for more information.

## Custom Processor

`SpessaSynthProcessor` allows you to supply a custom chorus processor.  
A custom chorus processor must implement the following parameters and behavior.

### level

0-127
This parameter sets the amount of the effect sent to the effect output.

### preLowpass

0-7
A low-pass filter can be applied to the sound coming into the effect to cut the high
frequency range. Higher values will cut more of the high frequencies, resulting in a
more mellow effect sound.

### feedback

0-127
This parameter sets the level at which the chorus sound is re-input (fed back) into the
chorus. By using feedback, a denser chorus sound can be created.
Higher values result in a greater feedback level.

### delay

0-127
This parameter sets the delay time of the chorus effect.

### rate

0-127
This parameter sets the speed (frequency) at which the chorus sound is modulated.
Higher values result in faster modulation.

### depth

0-127
This parameter sets the depth at which the chorus sound is modulated.
Higher values result in deeper modulation.

### sendLevelToReverb

0-127
This parameter sets the amount of chorus sound that will be sent to the reverb.
Higher values result in more sound being sent.

### sendLevelToDelay

0-127
This parameter sets the amount of chorus sound that will be sent to the delay.
Higher values result in more sound being sent.

### process

Process the effect and **adds** it to the output.

- input - The input buffer to process. It always starts at index 0.
- outputLeft - The left output buffer.
- outputRight - The right output buffer.
- outputReverb - The mono input for reverb. It always starts at index 0.
- outputDelay - The mono input for delay. It always starts at index 0.
- startIndex - The index to start mixing at into the output buffers.
- sampleCount - The amount of samples to mix.
