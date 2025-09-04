# MIDIChannel

## Description

This class represents a single MIDI channel within a `SpessaSynthProcessor`.

!!! Danger

    Unless you are doing advanced synth operations, you shouldn't be interacting with this class.
    This is for advanced users only.
    

This page serves as a documentation for this internal class. 
However, they can allow to manipulate the synth extensively.

!!! Note

    Note that methods here may not be 100% stable.

## Methods

!!! Note

    The MIDI methods (noteOn, noteOff, program change, etc.) are omitted here as they can be called from the `SpessaSynthProcessor` directly.
    
### resetPreset

Resets the preset to the default value.

### resetControllersRP15Compliant

Resets controllers according to [RP-15 Recommended Practice.](https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf)

### resetParameters

Reset all parameters to their default values.
This includes NRPN and RPN controllers, data entry state,
and generator overrides and offsets.

### dataEntryFine

Executes a data entry fine (LSB) change for the current channel.

Parameters:

- dataValue - The value to set for the data entry fine controller (0-127).


### dataEntryCoarse

Executes a data entry coarse (MSB) change for the current channel.

Parameters:

- dataValue - The value to set for the data entry coarse controller (0-127).

### transposeChannel

Transposes the channel by given amount of semitones.

Parameters:

- semitones - The number of semitones to transpose the channel by. Can be decimal.
- force - Defaults to false, if true, it will force the transpose even if the channel is a drum channel.

### setOctaveTuning

Sets the octave tuning for a given channel.

Parameters:

- tuning - the tuning array of 12 values, each representing the tuning for a note in the octave.

!!! Note

    Cent tunings are relative.
    
### setModulationDepth

Sets the modulation depth for the channel.

Parameters:

- cents - The modulation depth in cents to set.

!!! Note

    This method sets the modulation depth for the channel by converting the given cents value into a
    multiplier. The MIDI specification assumes the default modulation depth is 50 cents,
    but it may vary for different sound banks.
    For example, if you want a modulation depth of 100 cents,
    the multiplier will be 2,
    which, for a preset with a depth of 50,
    will create a total modulation depth of 100 cents.
    

### setTuning

Sets the channel's tuning.

Parameters: 

- cents - The tuning in cents to set.
- log - If true, logs the change to the console.

### setCustomController

Sets a custom controller.

Parameters:

- type - the custom controller to set
- value - the nev value of this controller.

The custom controllers enum is called `customControllers` in the exports.

### renderAudio

Renders Float32 audio for this channel.

Parameters: 

- outputLeft - the left output buffer.
- outputRight - the right output buffer.
- reverbOutputLeft - left output for reverb.
- reverbOutputRight - right output for reverb.
- chorusOutputLeft - left output for chorus.
- chorusOutputRight - right output for chorus.
- startIndex - start index offset.
- sampleCount - sample count to render.

### setPresetLock

Locks or unlocks the preset from MIDI program changes.

Parameters: 

locked - If the preset should be locked.

### setDrums

Changes the preset to, or from drums.
Note that this executes a program change.

Parameters: 

- isDrum - if the channel should be a drum preset or not.

### setPatch

Sets the channel to a given MIDI patch.
Note that this executes a program change.

Parameters:

- patch - the [MIDI Patch](midi-patch.md) to set the channel to.

### setGSDrums

Sets the GM/GS drum flag.

Parameters:

- drums - the new flag value.

### setVibrato

Sets a custom vibrato.

Parameters:

- depth - in cents.
- rate - in Hertz.
- delay - in seconds.

### disableAndLockGSNPRN

Disables and locks all GS NPRN parameters, including the custom vibrato.

### killNote

Stops a note nearly instantly.

Parameters:

- midiNote - the note to stop
- releaseTime (defaults to -12000) - the release time of the note.

### stopAllNotes

Stops all notes on the channel.

Parameters:

- force (default false) - If true, stops all notes immediately, otherwise applies release time.

### muteChannel

Mutes or unmutes a channel.

Parameters:

- isMuted - if the channel should be muted.