# Processor Event Types

This page serves as a detailed reference to all the event types `SpessaSynthProcessor` emits.

## Table summary

!!! Important

    If there's more than one property, the returned value is an object with the properties as keys.

| Name                    | Description                                      |
|-------------------------|--------------------------------------------------|
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
- `MSB`: `number` - Most Significant byte of the message. Ranges from 0 to 127.
- `LSB`: `number` - least significant byte of the message. Ranges from 0 to 127.

Note that the two bytes combined like this `MSB << 7 | LSB` will give you the pitch bend value from 0 to 16,383.
Also note that the pitch bend depends on the pitch bend range, usually two semitones up and down.

### `controllerChange`

This event is triggered when a controller is changed on any channel.

- `channel`: `number` - the channel that CC was changed on. Usually it ranges from 0 to 16, but it depends on the
  channel count.
- `controllerNumber`: `number` - the number of the MIDI controller list. Ranges from 0 to 127.
- `controllerValue`: `number` - the new value of the controller. Ranges from 0 to 127.

Note that this event is also called after `allcontrollerreset` if there were any locked controllers.
For example, if CC#1 was locked to 64,
after `allcontrollerreset` a `controllerchange` event will be called with `controllerNumber` 1 and `controllerValue` 64.

### `programChange`

This event is triggered when a program is changed on any channel (usually MIDI program change,
though [Some SysExes can change it too](https://github.com/spessasus/spessasynth_core/wiki/MIDI-Implementation#xg-part-setup)).
It is also called when receiving a system reset message.

- `channel`: `number` - the channel that had its program changed. Usually it ranges from 0 to 16, but it depends on the
  channel count.
- `program`: `number` - the new MIDI program number. Ranges from 0 to 127.
- `bank`: `number` - the new bank number of the preset. Ranges from 0 to 127.

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
Either with a SysEx message or with a MIDI CC message when the synthesizer is in XG mode.

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
a [Multi-Port MIDI file.](https://github.com/spessasus/spessasynth_core/wiki/About-Multi-Port)

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

- `presetList`: `array` - The sound bank preset list. Each item is an object:
    - `presetName`: `string` - The name of the preset.
    - `program`: `number` - The MIDI program number. Ranges from 0 to 127.
    - `bank`: `number` - The bank number of the preset. Ranges from 0 to 127.

### `allControllerReset`

This event is triggered when all controllers and programs have been reset. Effectively a system reset.

None. Note that if there were any locked controllers, they will be restored via `controllerchange` event after (like
described in `controllerchange`).

### `soundBankError`

This event is triggered when the loaded sound bank was invalid.

- `error`: `Error` - The error message from the parser, a JavaScript error object.

### `synthDisplay`

This event is triggered when a SysEx to display some text has been received.

- `displayData`: `Uint8Array` - the data to display, as raw bytes extracted from the MIDI SysEx message.
- `displayType`: `string` - the type of display. It can be one of the following:
    - 0 → Sound Canvas Text: The display data is ASCII text for Roland Sound Canvas.
    - 1 → XG Display Letters: Note that the first byte is the sixth byte of the message,
      also called "Display Letters" is included in the `displayData`.
      It is not the part of the text itself, but contains some information that you may want to parse.
      Refer to the XG specification for more information.
    - 2 → Sound Canvas Dot Display: The Sound Canvas Dot Display message. Usually used for the SC-55 and SC-88. Read
      page 193 from SC-88Pro owner's manual for more information.

### `channelPropertyChange`

This event is triggered when a channel property changes.

- `channel`: `number` - the channel number that received the change.
- `property`: `ChannelProperty` - the updated property. Defined as follows:

```ts
type ChannelProperty = {
    // The channel's current voice amount.
    voicesAmount: number;
    // The channel's current pitch bend from -8192 do 8192.
    pitchWheel: number;
    // The pitch bend's range, in semitones.
    pitchWheelRange: number;
    // Indicates whether the channel is muted.
    isMuted: boolean;
    // Indicates whether the channel is a drum channel.
    isDrum: boolean;
    // The channel's transposition, in semitones.
    transposition: number;
    // The bank number of the current preset.
    bank: number;
    // The MIDI program number of the current preset.
    program: number;
};
```

### `masterParameterChange`

This event is triggered when a master parameter changes.

- `parameter`: `MasterParameterType` - the master parameter type.
- `value`: varies - the new value of this parameter.

[All master parameters can be found here](master-parameter.md)