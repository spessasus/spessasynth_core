import type { MIDIController } from "../midi/enums";
import type { UserDrumSetParameter } from "../midi/types";
import type { MIDIPatchFull } from "../soundbank/basic_soundbank/midi_patch";
import type { MIDISystem } from "../soundbank/types";
import type {
    GSChorusProcessor,
    GSDelayProcessor,
    GSReverbProcessor
} from "./audio_engine/effects/types";
import type { ChannelMIDIParameter } from "./audio_engine/channel/parameters/midi";
import type { GlobalMIDIParameter } from "./audio_engine/parameters/midi";

/**
 * A shared interface for all channel events.
 *
 * @group Synthesizer.Events
 */
export interface ChannelEvent {
    /**
     * The MIDI channel number for this event.
     * Usually it ranges from 0 to 15, but it depends on the
     * channel count.
     */
    channel: number;
}

/**
 * This event is triggered when a note is pressed on any channel.
 *
 * > **Note**
 * >
 * > The note events report the direct MIDI note number requested. For the internal note, you can apply the key shift:
 * > ```ts
 * > const actualNote =
 * >     event.midiNote +
 * >     Math.trunc(this.synth.systemParameters.pitchOffset) +
 * >     this.synth.midiParameters.masterKeyShift +
 * >     this.synth.midiChannels[event.channel].systemParameters.pitchOffset +
 * >     this.synth.midiChannels[event.channel].midiParameters.keyShift;
 * > ```
 *
 * @group Synthesizer.Events
 */
export interface NoteOnEvent extends ChannelEvent {
    /**
     * The MIDI key number of the note that was pressed. Ranges from 0 to 127.
     */
    midiNote: number;

    /**
     * The velocity of the note (usually more means louder). Ranges from 0 to 127
     */
    velocity: number;
}

/**
 * This event is triggered when a note is released on any channel.
 *
 * @group Synthesizer.Events
 */
export interface NoteOffEvent extends ChannelEvent {
    /**
     * The MIDI key number of the note that was released. Ranges from 0 to 127.
     */
    midiNote: number;
}

/**
 * This event is triggered when a program is changed on any channel (usually MIDI program change),
 * though [some system exclusives can change it too.](../../docs/extra/midi-implementation.md)
 *
 * It is also called when receiving a system reset message.
 *
 * > **Warning**
 * >
 * > `isDrum` is the correct way of distinguishing between drum and melodic presets.
 * >
 * > _Do not_ use `isGMGSDrum` as the indication!
 *
 * @group Synthesizer.Events
 */
export interface ProgramChangeEvent extends MIDIPatchFull, ChannelEvent {}

/**
 * This event is triggered when a controller is changed on any channel (usually MIDI program change),
 * though [some system exclusives can change it too.](../../docs/extra/midi-implementation.md)
 *
 * > **NOTE**
 * >
 * > This event is also called after `reset` if there were any locked controllers.
 * > For example, if CC#1 was locked to 64,
 * > after `reset` a `controllerChange` event will be called with `controller` 1 and `value` 64.
 *
 * @group Synthesizer.Events
 */
export interface ControllerChangeEvent extends ChannelEvent {
    /**
     * The MIDI controller number. Ranges from 0 to 127.
     */
    controller: MIDIController;

    /**
     * The value of the controller.
     */
    value: number;
}

/**
 * This event is triggered when a MIDI polyphonic pressure event is received. This controls the pressure of a single note.
 * By default, this controls vibrato in SpessaSynth, though it can be changed with sound bank modulators.
 *
 * @group Synthesizer.Events
 */
export interface PolyPressureEvent extends ChannelEvent {
    /**
     *  The MIDI key number of the note that was affected.
     *  Ranges from 0 to 127.
     */
    midiNote: number;

    /**
     * The new pressure value.
     * Ranges from 0 to 127.
     */
    pressure: number;
}

/**
 * This event is triggered when all voices are stopped on a given channel.
 * Either manually or when receiving a system reset.
 *
 * @group Synthesizer.Events
 */
export interface StopAllEvent extends ChannelEvent {
    /**
     * If the channel was force stopped. (no release time)
     */
    force: boolean;
}

/**
 *
 * This event is triggered when a {@link ChannelMIDIParameter} changes.
 *
 * @group Synthesizer.Events
 */
export type ChannelMIDIParameterChangeEvent = {
    [P in keyof ChannelMIDIParameter]: ChannelEvent & {
        /**
         * The parameter that was changed.
         */
        parameter: P;
        /**
         * The new value of this parameter.
         */
        value: ChannelMIDIParameter[P];
    };
}[keyof ChannelMIDIParameter];

/**
 * The system exclusive data with the message.
 *
 * > **Warning**
 * >
 * > This excludes the starting `F0` byte.
 *
 * @group Synthesizer.Events
 */
export type DisplayMessageData = number[];

/**
 * This event is triggered when a {@link GlobalMIDIParameter} changes.
 *
 * @group Synthesizer.Events
 */
export type GlobalMIDIParameterChangeEvent = {
    [P in keyof GlobalMIDIParameter]: {
        /**
         * The parameter that was changed.
         */
        parameter: P;
        /**
         * The new value of this parameter.
         */
        value: GlobalMIDIParameter[P];
    };
}[keyof GlobalMIDIParameter];

/** @group Synthesizer.Events */
export type FXType<K> = Exclude<keyof K, "process" | "getSnapshot"> | "macro";

/**
 * This event is triggered when an effect processor has one of its parameters changed.
 *
 * The effects and their parameters can be found here:
 *
 * - {@link GSReverbProcessor}
 * - {@link GSChorusProcessor}
 * - {@link GSDelayProcessor}
 *
 * Insertion has a special treatment.
 *
 * @group Synthesizer.Events
 */
export type EffectChangeEvent =
    | {
          /**
           * The effect that was changed, `reverb`, `chorus`,`delay` or `insertion`
           */
          effect: "reverb";
          /**
           * The parameter type or `macro`.
           */
          parameter: FXType<GSReverbProcessor>;
          /**
           * The new 7-bit value.
           */
          value: number;
      }
    | {
          /**
           * The effect that was changed, `reverb`, `chorus`, `delay` or `insertion`
           */
          effect: "chorus";
          /**
           * The parameter type or `macro`.
           */
          parameter: FXType<GSChorusProcessor>;
          /**
           * The new 7-bit value.
           */
          value: number;
      }
    | {
          /**
           * The effect that was changed, `reverb`, `chorus`, `delay` or `insertion`
           */
          effect: "delay";
          /**
           * The parameter type or `macro`.
           */
          parameter: FXType<GSDelayProcessor>;
          /**
           * The new 7-bit value.
           */
          value: number;
      }
    | {
          /**
           * The effect that was changed, `reverb`, `chorus`, `delay` or `insertion`
           */
          effect: "insertion";

          /**
           * The parameter that was changed. This maps to GS address map at addr2 = `0x03`.
           * See SC-8850 Manual p.237,
           * for example:
           * - `0x0` - EFX type, the value is 16 bit in this special case. Note that this resets the parameters!
           * - `0x3` - EFX param 1
           * - `0x16` - EFX param 20 (usually level)
           * - `0x17` - EFX send to reverb
           */
          parameter: number;

          /**
           * The new value for the parameter.
           */
          value: number;
      };

/**
 * This event is triggered when a GS User Drum Set changes.
 *
 * @group Synthesizer.Events
 */
export type UserDrumSetChangeEvent = {
    [P in keyof UserDrumSetParameter]: {
        /**
         * The drum set that was changed. 0 means User Drum Set 1, and 1 means User Drum Set 2.
         */
        drumSet: number;

        /**
         * The MIDI note number that has been changed in the drum set.
         */
        midiNote: number;

        /**
         * The parameter that was changed.
         */
        parameter: P;

        /**
         * The new value of this parameter.
         */
        value: UserDrumSetParameter[P];
    };
}[keyof UserDrumSetParameter];

/**
 *
 * {@link SynthesizerEvent} represents an event that {@link SpessaSynthProcessor} emits.
 *
 * Events can be received by specifying a {@link SpessaSynthProcessor.onEventCall} callback.
 *
 * ## Table summary
 *
 * Here are all the event types {@link SpessaSynthProcessor} emits as a summary.
 *
 *
 * | Name                 | Interface                                 | Description                                     |
 * | -------------------- | ----------------------------------------- | ----------------------------------------------- |
 * | `noteOn`             | {@link NoteOnEvent}                       | Key has been pressed.                           |
 * | `noteOff`            | {@link NoteOffEvent}                      | Key has been released.                          |
 * | `controllerChange`   | {@link ControllerChangeEvent}             | Controller has been changed.                    |
 * | `programChange`      | {@link ProgramChangeEvent}                | Program has been changed.                       |
 * | `channelPressure`    | —                                         | Channel's pressure has been changed.            |
 * | `polyPressure`       | {@link PolyPressureEvent}                 | Note's pressure has been changed.               |
 * | `stopAll`            | {@link StopAllEvent}                      | All voices were stopped on a given channel.     |
 * | `channelAdded`       | —                                         | A new channel was added to the synth.           |
 * | `presetListChange`   | —                                         | The preset list has been changed/initialized.   |
 * | `reset`              | —                                         | The synthesizer has been reset.                 |
 * | `displayMessage`     | —                                         | The synthesizer has received a display message. |
 * | `globalParamChange`  | {@link GlobalMIDIParameterChangeEvent}    | A global MIDI Parameter has been changed.       |
 * | `channelParamChange` | {@link ChannelMIDIParameterChangeEvent}   | A channel MIDI Parameter has been changed.      |
 * | `effectChange`       | {@link EffectChangeEvent}                 | An effect parameter has been changed.           |
 * | `userDrumSetChange`  | {@link UserDrumSetChangeEvent}            | A GS User Drum Set has been changed.            |
 *
 * > **Note**
 * >
 * > `presetListChange` is the recommended way of retrieving the preset list.
 * > It automatically combines the sound banks and sends the list of presets as they will be played.
 * > It also signals that the sound bank has been fully loaded.
 *
 * @group Synthesizer.Events
 */
export interface SynthesizerEvent {
    /**
     * This event is triggered when a note is pressed on any channel.
     */
    noteOn: NoteOnEvent;
    /**
     * This event is triggered when a note is released on any channel.
     */
    noteOff: NoteOffEvent;

    /**
     * This event is triggered when a controller is changed on any channel (usually MIDI program change),
     * though  [some system exclusives can change it too.](../../docs/extra/midi-implementation.md)
     *
     * > **Note**
     * >
     * > This event is also called after `reset` if there were any locked controllers.
     * > For example, if CC#1 was locked to 64,
     * > after `reset` a `controllerChange` event will be called with `controller` 1 and `value` 64.
     *
     */
    controllerChange: ControllerChangeEvent;
    /**
     * This event is triggered when a program is changed on any channel (usually MIDI program change),
     * though [some system exclusives can change it too.](../../docs/extra/midi-implementation.md)
     *
     * It is also called when receiving a system reset message.
     */
    programChange: ProgramChangeEvent;
    /**
     * This event is triggered when a MIDI polyphonic pressure event is received. This controls the pressure of a single note.
     * By default, this controls vibrato in SpessaSynth, though it can be changed with sound bank modulators.
     */
    polyPressure: PolyPressureEvent;
    /**
     * This event is triggered when all voices are stopped on a given channel.
     * Either manually or when receiving a system reset.
     */
    stopAll: StopAllEvent;
    /**
     * This event is triggered when a new channel is added to the synthesizer.
     * Either manually,
     * or when the sequencer detects
     * a Multi-Port MIDI file. Consider reading [About Multi-Port MIDI Files](../../docs/extra/about-multi-port.md)
     */
    channelAdded: void;
    /**
     * This event is triggered when the preset list has been changed or initialized,
     * by adding, removing or changing sound banks, or when a MIDI with an embedded sound bank is loaded.
     * > **Important**
     * >
     * > This is the recommended way of retrieving the preset list,
     * > rather than loading the sound bank manually.
     *
     * The event data is the preset list.
     *
     * > **Warning**
     * >
     * > `isDrum` is the correct way of distinguishing between drum and melodic presets.
     * >
     * > _Do not_ use `isGMGSDrum` as the indication!
     */
    presetListChange: MIDIPatchFull[];
    /**
     * This event is triggered when all controllers and programs have been reset. Effectively a system reset.
     *
     * The data is the new system the synthesizer was reset with.
     *
     * > **Note**
     * >
     * > If there were any locked controllers, they will be restored via a {@link ControllerChangeEvent} after.
     */
    reset: MIDISystem;
    /**
     * This event is triggered when a SysEx to display some text has been received.
     *
     * The data is the entire system exclusive, **excluding the `F0` status byte.**
     *
     * Notable messages that can trigger this event:
     *
     * - All messages with GS Model ID of `0x45` (Display Data)
     * - GS Patch Name
     * - GS Drum Map Name
     * - XG Display Letter
     * - XG Display Bitmap
     *
     * > **Tip**
     * >
     * > Consider reading [the MIDI implementation](../../docs/extra/midi-implementation.md) to see the supported display messages.
     */
    displayMessage: DisplayMessageData;

    /**
     * This event is triggered when a {@link GlobalMIDIParameter} changes.
     */
    globalParamChange: GlobalMIDIParameterChangeEvent;

    /**
     * This event is triggered when a {@link ChannelMIDIParameter} changes.
     */
    channelParamChange: ChannelMIDIParameterChangeEvent;

    /**
     * This event is triggered when an effect processor has one of its parameters changed.
     *
     * The effects and their parameters can be found here:
     *
     * - {@link GSReverbProcessor}
     * - {@link GSChorusProcessor}
     * - {@link GSDelayProcessor}
     *
     *
     * Insertion has a special treatment.
     *
     */
    effectChange: EffectChangeEvent;

    /**
     * This event is triggered when a GS User Drum Set changes.
     */
    userDrumSetChange: UserDrumSetChangeEvent;
}

/**
 * @inheritDoc SynthesizerEvent
 *
 * @group Synthesizer.Events
 */
export type SynthesizerEventCallback = {
    [K in keyof SynthesizerEvent]: {
        type: K;
        data: SynthesizerEvent[K];
    };
}[keyof SynthesizerEvent];
