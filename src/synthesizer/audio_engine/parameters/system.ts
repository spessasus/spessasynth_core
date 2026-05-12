import { VOICE_CAP } from "../synth_constants";
import { type InterpolationType, InterpolationTypes } from "../../enums";
import type { SynthesizerCore } from "../synthesizer_core";
import { SpessaLog } from "../../../utils/loggin";

/**
 * The global parameters of the synthesizer.
 * These can only be changed via the API.
 */
export interface GlobalSystemParameter {
    // Synth exclusive
    /**
     * If the synthesizer processes the audio effects.
     */
    effectsEnabled: boolean;

    /**
     * If the event system is enabled.
     */
    eventsEnabled: boolean;

    /**
     * The maximum number of voices that can be played at once.
     *
     * Increasing this value causes memory allocation for more voices.
     * It is recommended to set it at the beginning, before rendering audio to avoid GC.
     * Decreasing it does not cause memory usage change, so it's fine to use.
     */
    voiceCap: number;

    /**
     * Enabling this parameter will cause a new voice allocation when the voice cap is hit, rather than stealing existing voices.
     *
     * This is not recommended in real-time environments.
     */
    autoAllocateVoices: boolean;

    /**
     * The reverb gain, from 0 to any number. 1 is 100% reverb.
     */
    reverbGain: number;

    /**
     * If the synthesizer should prevent editing of the reverb parameters.
     * This effect is modified using MIDI system exclusive messages, so
     * the recommended use case would be setting
     * the reverb parameters then locking it to prevent changes by MIDI files.
     */
    reverbLock: boolean;

    /**
     * The chorus gain, from 0 to any number. 1 is 100% chorus.
     */
    chorusGain: number;

    /**
     * If the synthesizer should prevent editing of the chorus parameters.
     * This effect is modified using MIDI system exclusive messages, so
     * the recommended use case would be setting
     * the chorus parameters then locking it to prevent changes by MIDI files.
     */
    chorusLock: boolean;

    /**
     * The delay gain, from 0 to any number. 1 is 100% delay.
     */
    delayGain: number;

    /**
     * If the synthesizer should prevent editing of the delay parameters.
     * This effect is modified using MIDI system exclusive messages, so
     * the recommended use case would be setting
     * the delay parameters then locking it to prevent changes by MIDI files.
     */
    delayLock: boolean;

    /**
     * If the synthesizer should prevent changing the insertion effect type and parameters (including enabling/disabling it on channels).
     * This effect is modified using MIDI system exclusive messages, so
     * the recommended use case would be setting
     * the insertion effect type and parameters then locking it to prevent changes by MIDI files.
     */
    insertionEffectLock: boolean;

    /**
     * If the synthesizer should prevent editing of the drum parameters.
     * These params are modified using MIDI system exclusive messages or NRPN, so
     * the recommended use case would be setting
     * the drum parameters then locking it to prevent changes by MIDI files.
     */
    drumLock: boolean;

    /**
     * Forces note killing instead of releasing. Improves performance in black MIDIs.
     */
    blackMIDIMode: boolean;

    /**
     * Synthesizer's device ID for system exclusive messages. Set to -1 to accept all.
     */
    deviceID: number;

    // Shared with channel
    /**
     * The master gain, from 0 to any number. 1 is 100% volume.
     */
    gain: number;

    /**
     * The master pan, from -1 (left) to 1 (right). 0 is center.
     */
    pan: number;

    /**
     * The global key shift in semitones.
     * Drum channels ignore this value.
     */
    keyShift: number;

    /**
     * The global tuning in cents.
     * Drum channels ignore this value.
     */
    fineTune: number;

    /**
     * The interpolation type used for sample playback.
     */
    interpolationType: InterpolationType;

    /**
     * If the synthesizer should prevent applying the custom vibrato.
     * This effect is modified using NRPN, so
     * the recommended use case would be setting
     * the custom vibrato then locking it to prevent changes by MIDI files.
     */
    customVibratoLock: boolean;

    /**
     * If the synthesizer should prevent changing any parameters via NRPN.
     * This includes the custom vibrato parameters.
     */
    nrpnParamLock: boolean;

    /**
     * Indicates whether the synthesizer is in monophonic retrigger mode.
     * This emulates the behavior of Microsoft GS Wavetable Synth,
     * Where a new note will kill the previous one if it is still playing.
     */
    monophonicRetrigger: boolean;
}

export const DEFAULT_GLOBAL_SYSTEM_PARAMETERS: GlobalSystemParameter = {
    // Synth exclusive
    effectsEnabled: true,
    eventsEnabled: true,
    voiceCap: VOICE_CAP,
    autoAllocateVoices: false,

    reverbGain: 1,
    reverbLock: false,

    chorusGain: 1,
    chorusLock: false,

    delayGain: 1,
    delayLock: false,

    insertionEffectLock: false,
    drumLock: false,

    blackMIDIMode: false,
    deviceID: -1,

    // Shared with channel
    gain: 1,
    pan: 0,
    keyShift: 0,
    fineTune: 0,

    interpolationType: InterpolationTypes.hermite,
    customVibratoLock: false,
    nrpnParamLock: false,
    monophonicRetrigger: false
};

/**
 * Sets a system parameter of the synthesizer.
 * @param parameter The type of the system parameter to set.
 * @param value The value to set for the system parameter.
 */
export function setSystemParameterInternal<
    P extends keyof GlobalSystemParameter
>(this: SynthesizerCore, parameter: P, value: GlobalSystemParameter[P]) {
    if (this.systemParameters[parameter] === value) return;
    const prev = this.systemParameters[parameter];
    this.systemParameters[parameter] = value;
    for (const ch of this.midiChannels) ch.updateInternalParams();
    // Additional handling for specific parameters
    switch (parameter) {
        default: {
            break;
        }

        case "voiceCap": {
            // Infinity is not allowed
            const cap = Math.min(value as number, 1_000_000);
            this.systemParameters.voiceCap = cap;
            // Disable all voices after cap
            for (let i = cap; i < this.voices.length; i++) {
                this.voices[i].isActive = false;
            }
            if (cap > this.voices.length) {
                SpessaLog.warn(
                    `Allocating ${cap - this.voices.length} new voices!`
                );
                this.allocateNewVoices(cap - this.voices.length);
            }
            break;
        }

        case "keyShift": {
            if ((prev as number) !== (value as number))
                this.stopAllChannels(true);
        }
    }
}
