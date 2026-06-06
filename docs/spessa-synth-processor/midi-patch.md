# MIDIPatch

SpessaSynth 4.0 brings the full bank LSB support in the API.

The system now operates on _MIDI Patches_ - a way of selecting MIDI presets using 4 properties,
compatible with GM, GS, XG and GM2.
The existing MIDI files will continue to work as the preset selection system has been fine-tuned for various types of MIDI files.

## MIDIPatch interface

### program

The MIDI program number, from 0 to 127.

### bankLSB

Bank LSB controller, 0 to 127. This is mostly used in XG and GM2 for selecting variations of instruments, much like MSB in GS.

!!! Note

    The SF2 format does not support writing the bank LSB number so the `wBank` is still interpreted as both and flattened when writing.

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
    The `MIDIPatchFull` sent with the `presetListChange` event provides an additional property `isDrum` which correctly identifies drums across all MIDI systems.

## MIDIPatchFull

An extended version of `MIDIPatch` containing two new properties.
This object is sent with the `presetListChange` event of the synthesizer,
and it is what `BasicPreset` implements.

### name

The name of the patch, a string.

### isDrum

Indicates if this patch is a drum patch.
If `isGMGSDrum` is true, then this is a GM/GS drum preset.
If `isGMGSDrum` is false, then this is a GM2/XG drum preset.

!!! Tip

    This is the recommended way of determining if this is a drum preset.

## MIDIPatchTools

A class containing useful functions for working with MIDI patches.

### toMIDIString

Converts a given `MIDIPatch` to a string.
The format is:

- `DRUM:program` for `GMGSDrum` set to `true`.
- `bankLSB:bankMSB:program` for `GMGSDrum` set to `false`.

### fromMIDIString

Gets `MIDIPatch` from a given string.

### toFullMIDIString

Converts a given `MIDIPatchFull`to string.
The format is:

- `<MIDIPatch string> D <name>` for `isDrum` set to `true`.
- `<MIDIPatch string> M <name>` for `isDrum` set to `true`.

### fromFullMIDIString

Gets `MIDIPatchFull` from a given string.

### matches

Checks if two MIDI patches represent the same one.

### compare

A comparison function for `.sort()` or `.toSorted()`,
ordering the patches in ascending order.

### isXGDrum

Checks if the given `MIDIPatchFull` is an XG/GM2 drum patch.

### selectPatch

A sophisticated patch selection system based on the MIDI Patch system.
This is the algorithm that the synthesizer uses for selecting presets.

```ts
MIDIPatchTools.selectPatch(patches, patch, system);
```

- patches - the `MIDIPatchFull` array to select from.
- patch - The `MIDIPatch` to select.
- system - The MIDI system (`xg`,`gs`,`gm2`,`gm`) to select for.

Returns the selected `MIDIPatchFull`.

!!! Note

    This function uses generics,
    so you can pass any object that implements `MIDIPatchFull`, including `BasicPreset`.

## XG Validity Test

Each sound bank is validated for XG compatibility.
That is, contains only allowed program numbers in the XG standard for the drum presets.
This is done because some sound bank set the bank MSB of 127 for Roland MT presets.

If a sound bank fails to meet that check, the GM/GS drum presets will be used instead of the GM2/XG drums.
