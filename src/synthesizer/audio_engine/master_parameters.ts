import { VOICE_CAP } from "./synth_constants";
import { type InterpolationType, InterpolationTypes } from "../enums";
import type { SynthesizerCore } from "./synthesizer_core";
import { SpessaLog } from "../../utils/loggin";

export interface GlobalMasterParameter {
    /**
     * If the synthesizer processes the audio effects.
     */
    effectsEnabled: boolean;

    /**
     * If the event system is enabled.
     */
    eventsEnabled: boolean;
    /**
     * The master gain, from 0 to any number. 1 is 100% volume.
     */
    gain: number;
    /**
     * The master pan, from -1 (left) to 1 (right). 0 is center.
     */
    pan: number;
    /**
     * The maximum number of voices that can be played at once.
     *
     * @remarks
     * Increasing this value causes memory allocation for more voices.
     * It is recommended to set it at the beginning, before rendering audio to avoid GC.
     * Decreasing it does not cause memory usage change, so it's fine to use.
     */
    voiceCap: number;
    /**
     * Enabling this parameter will cause a new voice allocation when the voice cap is hit, rather than stealing existing voices.
     *
     * @remarks
     * This is not recommended in real-time environments.
     */
    autoAllocateVoices: boolean;
    /**
     * The interpolation type used for sample playback.
     */
    interpolationType: InterpolationType;
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
     * Forces note killing instead of releasing. Improves performance in black MIDIs.
     */
    blackMIDIMode: boolean;
    /**
     * The global pitchOffset in semitones. It can be decimal to provide microtonal tuning.
     */
    pitchOffset: number;
    /**
     * Synthesizer's device ID for system exclusive messages. Set to -1 to accept all.
     */
    deviceID: number;
}

export const DEFAULT_GLOBAL_MASTER_PARAMETERS: GlobalMasterParameter = {
    gain: 1,
    pan: 0,
    voiceCap: VOICE_CAP,
    interpolationType: InterpolationTypes.hermite,
    monophonicRetriggerMode: false,
    reverbGain: 1,
    chorusGain: 1,
    delayGain: 1,
    reverbLock: false,
    chorusLock: false,
    delayLock: false,
    drumLock: false,
    effectsEnabled: true,
    eventsEnabled: true,
    customVibratoLock: false,
    nrpnParamLock: false,
    insertionEffectLock: false,
    blackMIDIMode: false,
    autoAllocateVoices: false,
    pitchOffset: 0,
    deviceID: -1
};

/**
 * Sets a master parameter of the synthesizer.
 * @param parameter The type of the master parameter to set.
 * @param value The value to set for the master parameter.
 */
export function setMasterParameter<P extends keyof GlobalMasterParameter>(
    this: SynthesizerCore,
    parameter: P,
    value: GlobalMasterParameter[P]
) {
    if (this.masterParameters[parameter] === value) return;
    const prev = this.masterParameters[parameter];
    this.masterParameters[parameter] = value;
    for (const ch of this.midiChannels) ch.updateInternalParams();
    // Additional handling for specific parameters
    switch (parameter) {
        default: {
            break;
        }

        case "voiceCap": {
            // Infinity is not allowed
            const cap = Math.min(value as number, 1_000_000);
            this.masterParameters.voiceCap = cap;
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

        case "pitchOffset": {
            const t = value as number;
            const keyShift = Math.trunc(t);
            if (Math.trunc(prev as number) !== keyShift)
                this.stopAllChannels(true);
        }
    }
}
