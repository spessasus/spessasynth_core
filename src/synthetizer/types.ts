import type { Voice } from "./audio_engine/engine_components/voice";
import type { interpolationTypes, synthDisplayTypes } from "./enums";

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
// A list of preset changes, each with a name, bank, and program number.
export type PresetListChangeCallback = PresetListChangeCallbackSingle[];
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
export type PolyPressureCallback = {
    /** The MIDI channel number. */
    channel: number;

    /** The MIDI note number. */
    midiNote: number;

    /** The pressure value. */
    pressure: number;
};
// The error message for soundfont errors.
export type SoundfontErrorCallback = Error;
export type EventType = {
    // This event fires when a note is played.
    noteon: NoteOnCallback;
    // This event fires when a note is released.
    noteoff: NoteOffCallback;
    // This event fires when a pitch wheel is changed.
    pitchwheel: PitchWheelCallback;
    // This event fires when a controller is changed.
    controllerchange: ControllerChangeCallback;
    // This event fires when a program is changed.
    programchange: ProgramChangeCallback;
    // This event fires when a channel pressure is changed.
    channelpressure: ChannelPressureCallback;
    // This event fires when a polyphonic pressure is changed.
    polypressure: PolyPressureCallback;
    // This event fires when a drum channel is changed.
    drumchange: DrumChangeCallback;
    // This event fires when all notes on a channel are stopped. There is no data for this event.
    stopall: undefined;
    // This event fires when a new channel is created. There is no data for this event.
    newchannel: undefined;
    // This event fires when a channel is muted or unmuted.
    mutechannel: MuteChannelCallback;
    // This event fires when the preset list is changed.
    presetlistchange: PresetListChangeCallback;
    // This event fires when all controllers on all channels are reset. There is no data for this event.
    allcontrollerreset: undefined;
    // This event fires when a sound bank parsing error occurs.
    soundfonterror: SoundfontErrorCallback;
    // This event fires when the synthesizer receives a display message.
    synthdisplay: SynthDisplayCallback;
};
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
    centTuning: number | null;
};

/**
 * Looping mode of the sample.
 * 0 - no loop.
 * 1 - loop.
 * 2 - UNOFFICIAL: polyphone 2.4 added start on release.
 * 3 - loop then play when released.
 */
export type SampleLoopingMode = 0 | 1 | 2 | 3;

// A list of voices for a given key:velocity.
export type VoiceList = Voice[];

// Represents a channel property in real-time.
export type ChannelProperty = {
    // The channel's current voice amount.
    voicesAmount: number;
    // The channel's current pitch bend from -8192 do 8192.
    pitchBend: number;
    // The pitch bend's range, in semitones.
    pitchBendRangeSemitones: number;
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

export type SynthProcessorOptions = {
    // Indicates if the event system is enabled.
    enableEventSystem: boolean;
    // The initial time of the synth, in seconds.
    initialTime: number;
    // Indicates if the effects are enabled.
    effectsEnabled: boolean;
    // The number of MIDI channels.
    midiChannels: number;
};
// The master parameters of the synthesizer.
export type MasterParameterType = {
    // The master gain, from 0 to any number. 1 is 100% volume.
    masterGain: number;
    // The master pan, from -1 (left) to 1 (right). 0 is center.
    masterPan: number;
    // The maximum number of voices that can be played at once.
    voiceCap: number;
    // The interpolation type used for sample playback.
    interpolationType: interpolationTypes;
    // The MIDI system used by the synthesizer. (GM, GM2, GS, XG)
    midiSystem: SynthSystem;
    // Indicates whether the synthesizer is in monophonic retrigger mode.
    // This emulates the behavior of Microsoft GS Wavetable Synth,
    // where a new note will kill the previous one if it is still playing.
    monophonicRetriggerMode: boolean;
    // The reverb gain, from 0 to any number. 1 is 100% reverb.
    reverbGain: number;
    // The chorus gain, from 0 to any number. 1 is 100% chorus.
    chorusGain: number;
    // Forces note killing instead of releasing. Improves performance in black MIDIs.
    blackMIDIMode: boolean;
    // The global transposition in semitones. It can be decimal.
    transposition: number;
};
