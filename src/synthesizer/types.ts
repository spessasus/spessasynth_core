import type { Voice } from "./audio_engine/engine_components/voice";
import type { InterpolationType } from "./enums";
import type {
    MIDIPatch,
    MIDIPatchNamed
} from "../soundbank/basic_soundbank/midi_patch";

export type SynthSystem = "gm" | "gm2" | "gs" | "xg";

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

export interface DrumChangeCallback {
    /** The MIDI channel number. */
    channel: number;

    /** Indicates if the channel is a drum channel. */
    isDrumChannel: boolean;
}

export interface ProgramChangeCallback extends MIDIPatch {
    /** The MIDI channel number. */
    channel: number;
}

export interface ControllerChangeCallback {
    /** The MIDI channel number. */
    channel: number;

    /** The controller number. */
    controllerNumber: number;

    /** The value of the controller. */
    controllerValue: number;
}

export interface MuteChannelCallback {
    /** The MIDI channel number. */
    channel: number;

    /** Indicates if the channel is muted. */
    isMuted: boolean;
}

export interface PresetListEntry extends MIDIPatchNamed {
    /**
     * Indicates if this preset is any kind of drum preset.
     */
    isAnyDrums: boolean;
}

/**
 * A list of preset changes, each with a name, bank, and program number.
 */
export type PresetList = PresetListEntry[];

/**
 * The synthesizer display system exclusive data, EXCLUDING THE F0 BYTE!
 */
type SynthDisplayCallback = number[];

export interface PitchWheelCallback {
    /** The MIDI channel number. */
    channel: number;

    /**
     * The unsigned 14-bit value of the pitch: 0 - 16383.
     */
    pitch: number;

    /**
     * If the pitch wheel was note-specific, this is the MIDI note number that was altered. Set to -1 otherwise.
     */
    midiNote: number;
}

export interface ChannelPressureCallback {
    /** The MIDI channel number. */
    channel: number;

    /** The pressure value. */
    pressure: number;
}

export interface PolyPressureCallback {
    /** The MIDI channel number. */
    channel: number;

    /** The MIDI note number. */
    midiNote: number;

    /** The pressure value. */
    pressure: number;
}

/**
 * The error message for sound bank errors.
 */
export type SoundBankErrorCallback = Error;

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

export type MasterParameterChangeCallback = {
    [P in keyof MasterParameterType]: {
        /**
         * The parameter that was changed.
         */
        parameter: P;
        /**
         * The new value of this parameter.
         */
        value: MasterParameterType[P];
    };
}[keyof MasterParameterType];

export interface ChannelPropertyChangeCallback {
    /**
     * The channel number of the new property.
     */
    channel: number;
    /**
     * The updated property.
     */
    property: ChannelProperty;
}

export interface SynthProcessorEventData {
    /**
     * This event fires when a note is played.
     */
    noteOn: NoteOnCallback;
    /**
     * This event fires when a note is released.
     */
    noteOff: NoteOffCallback;
    /**
     * This event fires when a pitch wheel is changed.
     */
    pitchWheel: PitchWheelCallback;
    /**
     * This event fires when a controller is changed.
     */
    controllerChange: ControllerChangeCallback;
    /**
     * This event fires when a program is changed.
     */
    programChange: ProgramChangeCallback;
    /**
     * This event fires when a channel pressure is changed.
     */
    channelPressure: ChannelPressureCallback;
    /**
     * This event fires when a polyphonic pressure is changed.
     */
    polyPressure: PolyPressureCallback;
    /**
     * This event fires when a drum channel is changed.
     */
    drumChange: DrumChangeCallback;
    /**
     * This event fires when all notes on a channel are stopped.
     */
    stopAll: StopAllCallback;
    /**
     * This event fires when a new channel is created. There is no data for this event.
     */
    newChannel: void;
    /**
     * This event fires when a channel is muted or unmuted.
     */
    muteChannel: MuteChannelCallback;
    /**
     * This event fires when the preset list is changed.
     */
    presetListChange: PresetList;
    /**
     * This event fires when all controllers on all channels are reset. There is no data for this event.
     */
    allControllerReset: void;
    /**
     * This event fires when a sound bank parsing error occurs.
     */
    soundBankError: SoundBankErrorCallback;
    /**
     * This event fires when the synthesizer receives a display message.
     */
    synthDisplay: SynthDisplayCallback;
    /**
     * This event fires when a master parameter changes.
     */
    masterParameterChange: MasterParameterChangeCallback;
    /**
     * This event fires when a channel property changes.
     */
    channelPropertyChange: ChannelPropertyChangeCallback;
}

export type SynthProcessorEvent = {
    [K in keyof SynthProcessorEventData]: {
        type: K;
        data: SynthProcessorEventData[K];
    };
}[keyof SynthProcessorEventData];

export interface SynthMethodOptions {
    /**
     * The audio context time when the event should execute, in seconds.
     */
    time: number;
}

/**
 * KeyNum: tuning.
 */
export type MTSProgramTuning = MTSNoteTuning[];

export interface MTSNoteTuning {
    /**
     * The base MIDI note to use, -1 means no change.
     */
    midiNote: number;

    /**
     * Additional tuning.
     */
    centTuning: number | null;
}

/**
 * Looping mode of the sample.
 * 0 - no loop.
 * 1 - loop.
 * 2 - UNOFFICIAL: polyphone 2.4 added start on release.
 * 3 - loop then play when released.
 */
export type SampleLoopingMode = 0 | 1 | 2 | 3;

/**
 * A list of voices for a given key:velocity.
 */
export type VoiceList = Voice[];

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
     * The channel's transposition, in semitones.
     */
    transposition: number;
}

export interface SynthProcessorOptions {
    /**
     * Indicates if the event system is enabled. This can be changed later.
     */
    enableEventSystem: boolean;
    /**
     * The initial time of the synth, in seconds.
     */
    initialTime: number;
    /**
     * Indicates if the effects are enabled. This can be changed later.
     */
    enableEffects: boolean;
}

/**
 * The master parameters of the synthesizer.
 */
export interface MasterParameterType {
    /**
     * The master gain, from 0 to any number. 1 is 100% volume.
     */
    masterGain: number;
    /**
     * The master pan, from -1 (left) to 1 (right). 0 is center.
     */
    masterPan: number;
    /**
     * The maximum number of voices that can be played at once.
     */
    voiceCap: number;
    /**
     * The interpolation type used for sample playback.
     */
    interpolationType: InterpolationType;
    /**
     * The MIDI system used by the synthesizer for bank selects and system exclusives. (GM, GM2, GS, XG)
     */
    midiSystem: SynthSystem;
    /**
     * Indicates whether the synthesizer is in monophonic retrigger mode.
     * This emulates the behavior of Microsoft GS Wavetable Synth,
     * Where a new note will kill the previous one if it is still playing.
     */
    monophonicRetriggerMode: boolean;
    /**
     * The reverb gain, from 0 to any number. 1 is 100% reverb.
     */
    reverbGain: number;
    /**
     * The chorus gain, from 0 to any number. 1 is 100% chorus.
     */
    chorusGain: number;
    /**
     * Forces note killing instead of releasing. Improves performance in black MIDIs.
     */
    blackMIDIMode: boolean;
    /**
     * The global transposition in semitones. It can be decimal to provide microtonal tuning.
     */
    transposition: number;
    /**
     * Synthesizer's device ID for system exclusive messages. Set to -1 to accept all.
     */
    deviceID: number;
}
