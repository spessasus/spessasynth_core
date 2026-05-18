import type { MIDIController } from "../../../midi/enums";
import type { ChannelMIDIParameter } from "./parameters/midi";
import type { MIDIPatchFull } from "../../../soundbank/basic_soundbank/midi_patch";

export interface NoteOnCallback {
    /** The MIDI note number. */
    midiNote: number;

    /** The MIDI channel number. */
    channel: number;

    /** The velocity of the note. */
    velocity: number;
}

export interface NoteOffCallback {
    /** The MIDI note number. */
    midiNote: number;

    /** The MIDI channel number. */
    channel: number;
}

export interface ProgramChangeCallback extends MIDIPatchFull {
    /** The MIDI channel number. */
    channel: number;
}

export interface ControllerChangeCallback {
    /** The MIDI channel number. */
    channel: number;

    /** The controller number. */
    controller: MIDIController;

    /** The value of the controller. */
    value: number;
}

export interface PolyPressureCallback {
    /** The MIDI channel number. */
    channel: number;

    /** The MIDI note number. */
    midiNote: number;

    /** The pressure value. */
    pressure: number;
}

export interface StopAllCallback {
    /**
     * The MIDI channel number.
     */
    channel: number;

    /**
     * If the channel was force stopped. (no release time)
     */
    force: boolean;
}

export type ChannelMIDIParameterChange = {
    [P in keyof ChannelMIDIParameter]: {
        /**
         * The channel that was affected.
         */
        channel: number;
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
