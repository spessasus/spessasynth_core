import type { MIDIPatchFull } from "../soundbank/basic_soundbank/midi_patch";
import type { CachedVoice } from "./audio_engine/voice/voice_cache";

import type {
    ChorusProcessor,
    DelayProcessor,
    ReverbProcessor
} from "./audio_engine/effects/types";
import type {
    ControllerChangeCallback,
    MIDIChannelParameterChangeCallback,
    NoteOffCallback,
    NoteOnCallback,
    PitchWheelCallback,
    PolyPressureCallback,
    ProgramChangeCallback,
    StopAllCallback
} from "./audio_engine/channel/types";
import type { MIDIGlobalParameter } from "./audio_engine/midi_parameters";

/**
 * The synthesizer display system exclusive data, EXCLUDING THE F0 BYTE!
 */
type SynthDisplayCallback = number[];

/**
 * The error message for sound bank errors.
 */
export type SoundBankErrorCallback = Error;

export type MIDIGlobalParameterChangeCallback = {
    [P in keyof MIDIGlobalParameter]: {
        /**
         * The parameter that was changed.
         */
        parameter: P;
        /**
         * The new value of this parameter.
         */
        value: MIDIGlobalParameter[P];
    };
}[keyof MIDIGlobalParameter];

type FXType<K> = Exclude<keyof K, "process" | "getSnapshot"> | "macro";

export type EffectChangeCallback =
    | {
          /**
           * The effect that was changed, "reverb", "chorus", "delay" or "insertion"
           */
          effect: "reverb";
          /**
           * The parameter type or "macro".
           */
          parameter: FXType<ReverbProcessor>;
          /**
           * The new 7-bit value.
           */
          value: number;
      }
    | {
          /**
           * The effect that was changed, "reverb", "chorus", "delay" or "insertion"
           */
          effect: "chorus";
          /**
           * The parameter type or "macro".
           */
          parameter: FXType<ChorusProcessor>;
          /**
           * The new 7-bit value.
           */
          value: number;
      }
    | {
          /**
           * The effect that was changed, "reverb", "chorus", "delay" or "insertion"
           */
          effect: "delay";
          /**
           * The parameter type or "macro".
           */
          parameter: FXType<DelayProcessor>;
          /**
           * The new 7-bit value.
           */
          value: number;
      }
    | {
          /**
           * The effect that was changed, "reverb", "chorus", "delay" or "insertion"
           */
          effect: "insertion";

          /**
           * The parameter that was changed. This maps to GS address map at addr2 = 0x03.
           * See SC-8850 Manual p.237,
           * for example:
           * - 0x0 - EFX type, the value is 16 bit in this special case. Note that this resets the parameters!
           * - 0x3 - EFX param 1
           * - 0x16 - EFX param 20 (usually level)
           * - 0x17 - EFX send to reverb
           */
          parameter: number;

          /**
           * The new value for the parameter.
           */
          value: number;
      };

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
     * Note that this only fires for per-note pitch wheel!
     */
    perNotePitchWheel: PitchWheelCallback;
    /**
     * This event fires when a controller is changed.
     */
    controllerChange: ControllerChangeCallback;
    /**
     * This event fires when a program is changed.
     */
    programChange: ProgramChangeCallback;
    /**
     * This event fires when a polyphonic pressure is changed.
     */
    polyPressure: PolyPressureCallback;
    /**
     * This event fires when all notes on a channel are stopped.
     */
    stopAll: StopAllCallback;
    /**
     * This event fires when a new channel is created. There is no data for this event.
     */
    newChannel: void;
    /**
     * This event fires when the preset list is changed.
     */
    presetListChange: MIDIPatchFull[];
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
     * This event fires when a MIDI global parameter changes.
     */
    midiGlobalChange: MIDIGlobalParameterChangeCallback;

    /**
     * This event fires when a MIDI channel parameter changes.
     */
    midiChannelChange: MIDIChannelParameterChangeCallback;

    /**
     * This event fires when an effect processor is modified.
     */
    effectChange: EffectChangeCallback;
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
export type CachedVoiceList = CachedVoice[];

export interface SynthProcessorOptions {
    /**
     * The maximum buffer size the synthesizer can render at once.
     * Attempting to `.process()` more samples than this will result in an error.
     * Defaults to 128.
     */
    maxBufferSize: number;
    /**
     * If the synthesizer processes the audio effects.
     * This can be changed later.
     */
    effectsEnabled: boolean;
    /**
     * If the event system is enabled.
     * This can be changed later.
     */
    eventsEnabled: boolean;
    /**
     * The initial time of the synth, in seconds.
     */
    initialTime: number;

    /**
     * Reverb processor for the synthesizer. Leave undefined to use the default.
     */
    reverbProcessor?: ReverbProcessor;

    /**
     * Chorus processor for the synthesizer. Leave undefined to use the default.
     */
    chorusProcessor?: ChorusProcessor;

    /**
     * Delay processor for the synthesizer. Leave undefined to use the default.
     */
    delayProcessor?: DelayProcessor;
}

export {
    type ChorusProcessor,
    type DelayProcessor,
    type ReverbProcessor
} from "./audio_engine/effects/types";
