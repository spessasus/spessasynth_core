# Event Types

This page serves as a detailed reference to all the event types `SpessaSynthProcessor` emits.

<!-- TOC -->
* [Event Types](#event-types)
  * [Table summary](#table-summary)
  * [Detailed descriptions](#detailed-descriptions)
    * [`noteoff`](#noteoff)
      * [Parameters](#parameters)
    * [`noteon`](#noteon)
      * [Parameters](#parameters-1)
    * [`pitchwheel`](#pitchwheel)
      * [Parameters](#parameters-2)
    * [`controllerchange`](#controllerchange)
      * [Parameters](#parameters-3)
    * [`programchange`](#programchange)
      * [Parameters](#parameters-4)
    * [`channelpressure`](#channelpressure)
      * [Parameters](#parameters-5)
    * [`polypressure`](#polypressure)
      * [Parameters](#parameters-6)
    * [`drumchange`](#drumchange)
      * [Parameters](#parameters-7)
    * [`stopall`](#stopall)
      * [Parameters](#parameters-8)
    * [`newchannel`](#newchannel)
      * [Parameters](#parameters-9)
    * [`mutechannel`](#mutechannel)
      * [Parameters](#parameters-10)
    * [`presetlistchange`](#presetlistchange)
      * [Parameters](#parameters-11)
    * [`allcontrollerreset`](#allcontrollerreset)
      * [Parameters](#parameters-12)
    * [`soundfonterror`](#soundfonterror)
      * [Parameters](#parameters-13)
    * [`synthdisplay`](#synthdisplay)
      * [Parameters](#parameters-14)
<!-- TOC -->

## Table summary

> [!IMPORTANT]
> If there's more than one property, the returned value is an object with the properties as keys.

| Name                 | Description                                     | Callback Properties                                                                                                                                                                                                 |
|----------------------|-------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `noteoff`            | Key has been released                           | - `midiNote`: number - the note that was released<br/> - `channel`: number - the channel number which got the note released                                                                                         |
| `noteon`             | Key has been pressed                            | - `midiNote`: number - the note that was pressed<br/> - `channel`: number - the channel that the note was played on<br/> - `velocity`: number - the velocity of the note                                            |
| `pitchwheel`         | Pitch wheel has been altered                    | - `channel`: number - the channel that was pitch bent<br/> - `MSB`: number - Most Significant byte of the message<br/> - `LSB`: number - least significant byte of the message                                      |
| `controllerchange`   | Controller has been changed                     | - `channel`: number - the channel that CC was changed on<br/> - `controllerNumber`: number - the number of the MIDI controller list<br/> - `controllerValue`: number - the new value of the controller              |
| `programchange`      | Program has been changed                        | - `channel`: number - the channel that had its program changed<br/> - `program`: number - the new MIDI program number<br/> - `bank`: number - the new bank number of the preset                                     |
| `channelpressure`    | Channel's pressure has been changed             | - `channel`: number - the channel affected<br/> - `pressure`: number - the new pressure                                                                                                                             |
| `polypressure`       | Note's pressure has been changed                | - `midiNote`: number - the note that was affected<br/> - `channel`: number - the channel affected<br/> - `pressure`: number - the new pressure                                                                      |
| `drumchange`         | Channel's drum mode was changed                 | - `channel`: number - the channel<br/> - `isDrumChannel`: boolean - if the channel is now a drum channel or not                                                                                                     |
| `stopall`            | All voices were stopped                         | None                                                                                                                                                                                                                |
| `newchannel`         | A new channel was added to the synth            | None                                                                                                                                                                                                                |
| `mutechannel`        | A channel has been muted/unmuted                | - `channel`: number - the channel that was altered<br/> - `isMuted`: boolean - if the channel is muted or unmuted                                                                                                   |
| `presetlistchange`   | The preset list has been changed/initialized    | - `presetList`: array - The soundfont preset list. Each item is an object: `{presetName: string, program: number, bank: number}`                                                                                    |
| `allcontrollerreset` | All controllers have been reset (and programs!) | None. Note: if there were any locked controllers, they will be restored via `controllerchange` event after. For example `allcontrollersreset` will be called and then `controllerchange` for the locked controller. |
| `soundfonterror`     | The loaded soundfont was invalid                | - `error`: object - The error message from the `SoundFont2` class                                                                                                                                                   |
| `synthdisplay`       | A SysEx to display some text has been received  | - `displayData`: Uint8Array - the data to display,<br/> - `displayType`: the type of display. Read more below.                                                                                                      |

> [!NOTE]
> `presetlistchange` is the recommended way of retrieving the preset list.
> It automatically combines the soundfonts and sends the list of presets as they will be played.
> It also signals that the soundfont has been fully loaded.

## Detailed descriptions

### `noteoff`
This event is triggered when a note is released on any channel.

#### Parameters
- `midiNote`: `number` - the MIDI key number of the note that was released. Ranges from 0 to 127.
- `channel`: `number` - the channel number which got the note released. Usually it ranges from 0 to 16, but it depends on the channel count.

### `noteon`
This event is triggered when a note is pressed on any channel.

#### Parameters
- `midiNote`: `number` - the MIDI key number of the note that was pressed. Ranges from 0 to 127.
- `channel`: `number` - the channel that the note was played on. Usually it ranges from 0 to 16, but it depends on the channel count.
- `velocity`: `number` - the velocity of the note (usually more means louder). Ranges from 0 to 127.

### `pitchwheel`
This event is triggered when the pitch wheel is altered on any channel.

#### Parameters
- `channel`: `number` - the channel that was pitch bent. Usually it ranges from 0 to 16, but it depends on the channel count.
- `MSB`: `number` - Most Significant byte of the message. Ranges from 0 to 127.
- `LSB`: `number` - least significant byte of the message. Ranges from 0 to 127.

Note that the two bytes combined like this `MSB << 7 | LSB` will give you the pitch bend value from 0 to 16,383.
Also note that the pitch bend depends on the pitch bend range, usually two semitones up and down.

### `controllerchange`
This event is triggered when a controller is changed on any channel.

#### Parameters
- `channel`: `number` - the channel that CC was changed on. Usually it ranges from 0 to 16, but it depends on the channel count.
- `controllerNumber`: `number` - the number of the MIDI controller list. Ranges from 0 to 127.
- `controllerValue`: `number` - the new value of the controller. Ranges from 0 to 127.

Note that this event is also called after `allcontrollerreset` if there were any locked controllers.
For example, if CC#1 was locked to 64,
 after `allcontrollerreset` a `controllerchange` event will be called with `controllerNumber` 1 and `controllerValue` 64.

### `programchange`
This event is triggered when a program is changed on any channel (usually MIDI program change,
though [Some SysExes can change it too](https://github.com/spessasus/spessasynth_core/wiki/MIDI-Implementation#xg-part-setup)).
It is also called when receiving a system reset message.

#### Parameters
- `channel`: `number` - the channel that had its program changed. Usually it ranges from 0 to 16, but it depends on the channel count.
- `program`: `number` - the new MIDI program number. Ranges from 0 to 127.
- `bank`: `number` - the new bank number of the preset. Ranges from 0 to 127.

### `channelpressure`
This event is triggered when a MIDI channel pressure event is received. This usually controls channels' vibrato.

#### Parameters
- `channel`: `number` - the channel affected. Usually it ranges from 0 to 16, but it depends on the channel count.
- `pressure`: `number` - the new pressure. Ranges from 0 to 127.

### `polypressure`
This event is triggered when a MIDI polyphonic pressure event is received. This controls the pressure of a single note.
By default, this controls vibrato in SpessaSynth, though it can be changed with SoundFont modulators.

#### Parameters
- `midiNote`: `number` - the MIDI key number of the note that was affected. Ranges from 0 to 127.
- `channel`: `number` - the channel affected. Usually it ranges from 0 to 16, but it depends on the channel count.
- `pressure`: `number` - the new pressure. Ranges from 0 to 127.

### `drumchange`
This event is triggered when a channel is changed to a drum channel or back to a normal channel.
Either with a SysEx message or with a MIDI CC message when the synthesizer is in XG mode.

#### Parameters
- `channel`: `number` - the channel that was altered. Usually it ranges from 0 to 16, but it depends on the channel count.
- `isDrumChannel`: `boolean` - if the channel is now a drum channel or not.

### `stopall`
This event is triggered when all voices are stopped. Either manually or when receiving a system reset.

#### Parameters
None.

### `newchannel`
This event is triggered when a new channel is added to the synthesizer. 
Either manually,
or when the sequencer detects a [Multi-Port MIDI file.](https://github.com/spessasus/spessasynth_core/wiki/About-Multi-Port)

#### Parameters
None.

### `mutechannel`
This event is triggered when a channel is muted or unmuted.
This only can be done manually, there's no MIDI message to mute a channel.

#### Parameters
- `channel`: `number` - the channel that was altered. Usually it ranges from 0 to 16, but it depends on the channel count.
- `isMuted`: `boolean` - if the channel is muted or unmuted.

### `presetlistchange`
This event is triggered when the preset list has been changed or initialized,
by adding, removing or changing soundfonts, or when a MIDI with an embedded soundfont is loaded.
Note that this is the recommended way of retrieving the preset list, rather than loading the soundfont manually.

#### Parameters
- `presetList`: `array` - The soundfont preset list. Each item is an object:
  - `presetName`: `string` - The name of the preset.
  - `program`: `number` - The MIDI program number. Ranges from 0 to 127.
  - `bank`: `number` - The bank number of the preset. Ranges from 0 to 127.

### `allcontrollerreset`
This event is triggered when all controllers and programs have been reset. Effectively a system reset.

#### Parameters
None. Note that if there were any locked controllers, they will be restored via `controllerchange` event after (like described in `controllerchange`).

### `soundfonterror`
This event is triggered when the loaded soundfont was invalid.

#### Parameters
- `error`: `Error` - The error message from the parser, a JavaScript error object.

### `synthdisplay`
This event is triggered when a SysEx to display some text has been received.

#### Parameters
- `displayData`: `Uint8Array` - the data to display, as raw bytes extracted from the MIDI SysEx message.
- `displayType`: `string` - the type of display. It can be one of the following:
  - 0 → Sound Canvas Text: The display data is ASCII text for Roland Sound Canvas. 
  - 1 → XG Display Letters: Note that the first byte is the sixth byte of the message,
  also called "Display Letters" is included in the `displayData`.
  It is not the part of the text itself, but contains some information that you may want to parse.
  Refer to the XG specification for more information.
  - 2 → Sound Canvas Dot Display: The Sound Canvas Dot Display message. Usually used for the SC-55 and SC-88. Read page 193 from SC-88Pro owner's manual for more information.