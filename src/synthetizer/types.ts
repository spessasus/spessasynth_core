import { synthDisplayTypes } from "./enums.ts";

export type SynthSystem = "gm" | "gm2" | "gs" | "xg";
export type NoteOnCallback = {
    /** The MIDI note number. */
    midiNote: number;

    /** The MIDI channel number. */
    channel: number;

    /** The velocity of the note. */
    velocity: number;
};
export type NoteOffCallback = {
    /** The MIDI note number. */
    midiNote: number;

    /** The MIDI channel number. */
    channel: number;
};
export type DrumChangeCallback = {
    /** The MIDI channel number. */
    channel: number;

    /** Indicates if the channel is a drum channel. */
    isDrumChannel: boolean;
};
export type ProgramChangeCallback = {
    /** The MIDI channel number. */
    channel: number;

    /** The program number. */
    program: number;

    /** The bank number. */
    bank: number;
};
export type ControllerChangeCallback = {
    /** The MIDI channel number. */
    channel: number;

    /** The controller number. */
    controllerNumber: number;

    /** The value of the controller. */
    controllerValue: number;
};
export type MuteChannelCallback = {
    /** The MIDI channel number. */
    channel: number;

    /** Indicates if the channel is muted. */
    isMuted: boolean;
};
export type PresetListChangeCallbackSingle = {
    /** The name of the preset. */
    presetName: string;

    /** The bank number. */
    bank: number;

    /** The program number. */
    program: number;
};
export type PresetListChangeCallback = PresetListChangeCallbackSingle[]; // A list of preset objects.
export type SynthDisplayCallback = {
    /** The data to display. */
    displayData: Uint8Array;

    /** The type of display. */
    displayType: synthDisplayTypes; // The type of display (assuming 'synthDisplayTypes' is defined elsewhere).
};
export type PitchWheelCallback = {
    /** The MIDI channel number. */
    channel: number;

    /** The most significant byte of the pitch-wheel value. */
    MSB: number;

    /** The least significant byte of the pitch-wheel value. */
    LSB: number;
};
export type ChannelPressureCallback = {
    /** The MIDI channel number. */
    channel: number;

    /** The pressure value. */
    pressure: number;
};
export type SoundfontErrorCallback = Error; // The error message for soundfont errors.
export type EventCallbackData =
    | NoteOnCallback
    | NoteOffCallback
    | DrumChangeCallback
    | ProgramChangeCallback
    | ControllerChangeCallback
    | MuteChannelCallback
    | PresetListChangeCallback
    | PitchWheelCallback
    | SoundfontErrorCallback
    | ChannelPressureCallback
    | SynthDisplayCallback
    | undefined; // Includes undefined as a possible type.
export type EventTypes =
    | "noteon"
    | "noteoff"
    | "pitchwheel"
    | "controllerchange"
    | "programchange"
    | "channelpressure"
    | "polypressure"
    | "drumchange"
    | "stopall"
    | "newchannel"
    | "mutechannel"
    | "presetlistchange"
    | "allcontrollerreset"
    | "soundfonterror"
    | "synthdisplay";
export type SynthMethodOptions = {
    // The audio context time when the event should execute, in seconds.
    time: number;
};
/**
 * KeyNum: tuning.
 */
export type MTSProgramTuning = MTSNoteTuning[];
export type MTSNoteTuning = {
    // The base MIDI note to use, -1 means no change.
    midiNote: number;

    // Additional tuning.
    centTuning: number;
};
