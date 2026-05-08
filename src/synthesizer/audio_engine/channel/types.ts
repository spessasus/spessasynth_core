import type { MIDIController } from "../../../midi/enums";
import type { MIDIChannelParameter } from "./midi_parameters";
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

export interface PitchWheelCallback {
    /** The MIDI channel number. */
    channel: number;

    /**
     * The unsigned 14-bit value of the pitch: 0 - 16383.
     */
    pitch: number;

    /**
     * The MIDI note number that was altered.
     */
    midiNote: number;
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

export type MIDIChannelParameterChangeCallback = {
    [P in keyof MIDIChannelParameter]: {
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
        value: MIDIChannelParameter[P];
    };
}[keyof MIDIChannelParameter];

export interface CustomChannelVibrato {
    /**
     * Vibrato depth, as gain.
     */
    depth: number;
    /**
     * Vibrato delay, in seconds from the voice's start time.
     */
    delay: number;
    /**
     * Vibrato rate in Hertz.
     */
    rate: number;
}
