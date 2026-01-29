# MIDIPatch

SpessaSynth 4.0 brings the full bank LSB support in the API.

## Description

The system now operates on _MIDI Patches_ - a way of selecting MIDI presets using 4 properties,
compatible with GM, GS, XG and GM2.
The existing MIDI files will continue to work as the preset selection system has been fine-tuned for various types of MIDI files.

## Properties

### program

The MIDI program number, from 0 to 127.

### bankLSB

Bank LSB controller, 0 to 127. This is mostly used in XG and GM2 for selecting variations of instruments, much like MSB in GS.

Note that the SF2 format does not support writing the bank LSB number so the `wBank` is still interpreted as both and flattened when writing.

### bankMSB

This is what the previous `bank` used to be, but it's now properly split up.

It is used for sound variation in GS, and for channel type in XG and GM2.
This means that with bank MSB of 127 for example, a channel in XG mode will turn into a drum channel.

### isGMGSDrum

This flag is exclusive to GM and GS systems. These don't use bank MSB as a drum flag.
GM has channel 9 hardcoded as drums, and GS has a system exclusive for setting them.
This allows XG and GS drums to coexist in a single sound bank and can be thought of as bank 128 in SF2.

!!! Warning

    The `isGMGSDrum` flag being set does *not* necessarily mean that this patch is a drum patch!
    The preset list change event provides an additional property `isAnyDrums` which correctly identifies drums across all MIDI systems.

## XG Validity Test

Each sound bank is validated for XG compatibility.
That is, contains only allowed program numbers in the XG standard for the drum presets.
This is done because some sound bank set the bank MSB of 127 for Roland MT presets.

If a sound bank fails to meet that check, the GM/GS drum presets will be used instead of the GM2/XG drums.
