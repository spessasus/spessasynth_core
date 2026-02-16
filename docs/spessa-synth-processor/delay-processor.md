# Delay Processor

Delay creates echoes. It is also possible to give depth and width to a sound by adding
a short delay to the original sound.

## Editing the parameters

Editing the parameters can be done via GS system exclusive messages.

Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf) (p.79, 235-236) for more information.

## Custom Processor

`SpessaSynthProcessor` allows you to supply a custom delay processor.  
A custom delay processor must implement the following parameters and behavior.

### level

0-127
This parameter sets the amount of the effect sent to the effect output.

### preLowpass

0-7
A low-pass filter can be applied to the sound coming into the effect to cut the high
frequency range. Higher values will cut more of the high frequencies, resulting in a
more mellow effect sound.

### timeCenter

0-115
0.1ms-340ms-1000ms
The delay effect has three delay times; center, left and
right (when listening in stereo). Delay Time Center sets the delay time of the delay
located at the center.
Refer to SC-8850 Owner's Manual p. 236 for the exact mapping of the values.

### timeRatioLeft

0-120
4% - 500%
This parameter sets the delay time of the delay located at the left as a percentage of
the Delay Time Center (up to a max. of 1.0 s).
The resolution is 100/24(%).

### timeRatioRight

1-120
4%-500%
This parameter sets the delay time of the delay located at the right as a percentage of
the Delay Time Center (up to a max. of 1.0 s).
The resolution is 100/24(%).

### levelCenter

0-127
This parameter sets the volume of the central delay. Higher values result in a louder
center delay.

### levelLeft

0-127
This parameter sets the volume of the left delay. Higher values result in a louder left
delay.

### levelRight

0-127
This parameter sets the volume of the right delay. Higher values result in a louder
right delay.

### feedback

0-127
(-64)-63
This parameter affects the number of times the delay will repeat. With a value of 0,
the delay will not repeat. With higher values there will be more repeats.
With negative (-) values, the center delay will be fed back with inverted phase.
Negative values are effective with short delay times.

### sendLevelToReverb

0-127
This parameter sets the amount of delay sound that will be sent to the reverb.
Higher values result in more sound being sent.

### process

Process the effect and **adds** it to the output.

- input - The input buffer to process. It always starts at index 0.
- outputLeft - The left output buffer.
- outputRight - The right output buffer.
- outputReverb - The mono input for reverb. It always starts at index 0.
- startIndex - The index to start mixing at into the output buffers.
- sampleCount - The amount of samples to mix.
