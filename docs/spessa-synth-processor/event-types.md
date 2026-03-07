# Processor Event Types

This page serves as a detailed reference to all the event types `SpessaSynthProcessor` emits.

## Table summary

!!! Important

    If there's more than one property, the returned value is an object with the properties as keys.

| Name                    | Description                                      |
| ----------------------- | ------------------------------------------------ |
| `noteOff`               | Key has been released.                           |
| `noteOn`                | Key has been pressed.                            |
| `pitchWheel`            | Pitch wheel has been altered.                    |
| `controllerChange`      | Controller has been changed.                     |
| `programChange`         | Program has been changed.                        |
| `channelPressure`       | Channel's pressure has been changed.             |
| `polyPressure`          | Note's pressure has been changed.                |
| `drumChange`            | Channel's drum mode was changed.                 |
| `stopAll`               | All voices were stopped.                         |
| `newChannel`            | A new channel was added to the synth.            |
| `muteChannel`           | A channel has been muted/unmuted.                |
| `presetListChange`      | The preset list has been changed/initialized.    |
| `allControllerReset`    | All controllers have been reset. (and programs!) |
| `soundBankError`        | The loaded sound bank was invalid.               |
| `synthDisplay`          | A SysEx to display some text has been received.  |
| `channelPropertyChange` | A channel's property has changed.                |
| `masterParameterChange` | A master parameter has been changed              |

!!! Note

    `presetListChange` is the recommended way of retrieving the preset list.
    It automatically combines the sound banks and sends the list of presets as they will be played.
    It also signals that the sound bank has been fully loaded.

## Detailed descriptions

### `noteOff`

This event is triggered when a note is released on any channel.

- `midiNote`: `number` - the MIDI key number of the note that was released. Ranges from 0 to 127.
- `channel`: `number` - the channel number which got the note released. Usually it ranges from 0 to 16, but it depends
  on the channel count.

### `noteOn`

This event is triggered when a note is pressed on any channel.

- `midiNote`: `number` - the MIDI key number of the note that was pressed. Ranges from 0 to 127.
- `channel`: `number` - the channel that the note was played on. Usually it ranges from 0 to 16, but it depends on the
  channel count.
- `velocity`: `number` - the velocity of the note (usually more means louder). Ranges from 0 to 127.

### `pitchWheel`

This event is triggered when the pitch wheel is altered on any channel.

- `channel`: `number` - the channel that was pitch bent. Usually it ranges from 0 to 16, but it depends on the channel
  count.
- `pitch`: `number` - The unsigned 14-bit value of the pitch: 0 - 16,383.
- `midiNote`: `number` - If the pitch wheel was note-specific, this is the MIDI note number that was altered. Set to -1 otherwise.

Note that the pitch wheel depends on the pitch wheel range, usually two semitones up and down.

### `controllerChange`

This event is triggered when a controller is changed on any channel.

- `channel`: `number` - the channel that CC was changed on. Usually it ranges from 0 to 16, but it depends on the
  channel count.
- `controllerNumber`: `number` - the number of the MIDI controller list. Ranges from 0 to 127.
- `controllerValue`: `number` - the new value of the controller. Ranges from 0 to 127.

Note that this event is also called after `allControllerReset` if there were any locked controllers.
For example, if CC#1 was locked to 64,
after `allControllerReset` a `controllerChange` event will be called with `controllerNumber` 1 and `controllerValue` 64.

### `programChange`

This event is triggered when a program is changed on any channel (usually MIDI program change,
though [Some SysExes can change it too](../extra/midi-implementation.md#xg-part-setup)).
It is also called when receiving a system reset message.

- `channel`: `number` - the channel that had its program changed. Usually it ranges from 0 to 16, but it depends on the
  channel count.
- `program`: `number` - the new MIDI program number. Ranges from 0 to 127.
- `bankMSB`: `number` - the new bank MSB number of the preset. Ranges from 0 to 127.
- `bankLSB`: `number` - the new bank LSB number of the preset. Ranges from 0 to 127.
- `isGMGSDrum`: `boolean` - if the new preset is a GM or GS drum preset. **This does not determine whether this preset is actually a drum preset.**

Note: the last 4 properties are a [MIDI Patch](midi-patch.md) - a way of identifying the selected preset from the preset list.

### `channelPressure`

This event is triggered when a MIDI channel pressure event is received. This usually controls channels' vibrato.

- `channel`: `number` - the channel affected. Usually it ranges from 0 to 16, but it depends on the channel count.
- `pressure`: `number` - the new pressure. Ranges from 0 to 127.

### `polyPressure`

This event is triggered when a MIDI polyphonic pressure event is received. This controls the pressure of a single note.
By default, this controls vibrato in SpessaSynth, though it can be changed with sound bank modulators.

- `midiNote`: `number` - the MIDI key number of the note that was affected. Ranges from 0 to 127.
- `channel`: `number` - the channel affected. Usually it ranges from 0 to 16, but it depends on the channel count.
- `pressure`: `number` - the new pressure. Ranges from 0 to 127.

### `drumChange`

This event is triggered when a channel is changed to a drum channel or back to a normal channel.
Either with a SysEx message or with a MIDI CC message when the synthesizer is in XG or GM2 mode.

- `channel`: `number` - the channel that was altered. Usually it ranges from 0 to 16, but it depends on the channel
  count.
- `isDrumChannel`: `boolean` - if the channel is now a drum channel or not.

### `stopAll`

This event is triggered when all voices are stopped. Either manually or when receiving a system reset.

This event has no data.

### `newChannel`

This event is triggered when a new channel is added to the synthesizer.
Either manually,
or when the sequencer detects
a [Multi-Port MIDI file.](../extra/about-multi-port.md)

This event has no data.

### `muteChannel`

This event is triggered when a channel is muted or unmuted.
This only can be done manually, there's no MIDI message to mute a channel.

- `channel`: `number` - the channel that was altered. Usually it ranges from 0 to 16, but it depends on the channel
  count.
- `isMuted`: `boolean` - if the channel is muted or unmuted.

### `presetListChange`

This event is triggered when the preset list has been changed or initialized,
by adding, removing or changing sound banks, or when a MIDI with an embedded sound bank is loaded.
Note that this is the recommended way of retrieving the preset list, rather than loading the sound bank manually.

The event data is the preset list. Each item is a preset list entry:

- The properties of a [MIDI Patch](midi-patch.md).
- `name`: `string` - The name of the preset.
- `isAnyDrums`: `boolean` - if this preset is a drum preset. \*This is the correct way of distinguishing between drum and melodic presets.

### `allControllerReset`

This event is triggered when all controllers and programs have been reset. Effectively a system reset.

None. Note that if there were any locked controllers, they will be restored via `controllerChange` event after (like
described in `controllerChange`).

### `soundBankError`

This event is triggered when the loaded sound bank was invalid.

The data is the error message from the parser, a JavaScript error object.

### `synthDisplay`

This event is triggered when a SysEx to display some text has been received.

The data is a number array of the entire system exclusive, excluding the `F0` status byte.

### `channelPropertyChange`

This event is triggered when a channel property changes.

- `channel`: `number` - the channel number that received the change.
- `property`: `ChannelProperty` - the updated property. Defined as follows:

```ts
export interface ChannelProperty {
    /**
     * The channel's current voice amount.
     */
    voicesAmount: number;
    /**
     * The channel's current pitch wheel 0 - 16384.
     */
    pitchWheel: number;
    /**
     * The pitch wheel's range, in semitones.
     */
    pitchWheelRange: number;
    /**
     * Indicates whether the channel is muted.
     */
    isMuted: boolean;
    /**
     * Indicates whether the channel is a drum channel.
     */
    isDrum: boolean;

    /**
     * Indicates whether the channel uses an insertion effect.
     * This means that there will be no separate dry output for processSplit().
     */
    isEFX: boolean;

    /**
     * The channel's transposition, in semitones.
     */
    transposition: number;
}
```

### `masterParameterChange`

This event is triggered when a master parameter changes.

- `parameter`: `MasterParameterType` - the master parameter type.
- `value`: varies - the new value of this parameter.

Note that this event usually triggers from the MIDI system change or user's change.

[All master parameters can be found here](master-parameter.md)

### `effectChange`

This event is triggered when an effect processor has one of its parameters changed.

- `effect`: `"reverb"|"chorus"|"delay"|"insertion"` - The effect processor that triggered the event.
- `parameter`: varies - The parameter corresponding to the effect processor or `"macro"` if a preset macro was set.
- `value`: `number` - The new 7-bit value of the parameter.

The effects and their parameters can be found here:

- [reverb](reverb-processor.md)
- [chorus](chorus-processor.md)
- [delay](delay-processor.md)

#### Insertion

The parameters behave a bit differently when the `effect` is set to `"insertion"`:

- `parameter`: `number`

The parameter that was changed. This maps to GS address map at addr2 = 0x03.
See SC-8850 Manual p.237,
for example:

- `0x0` - EFX type, the value is 16 bit in this special case. Note that this resets the parameters!
- `0x3` - EFX param 1
- `0x16` - EFX param 20 (usually level)
- `0x17` - EFX send to reverb
  For these, the value is a 7-bit number set via the system exclusive.

There are two exceptions:

- `-1` - the channel has ENABLED the effect.
- `-2` - the channel has DISABLED the effect.
  For both of these cases, `value` is the channel number.

`value`: `number` - the new value for the given parameter.
