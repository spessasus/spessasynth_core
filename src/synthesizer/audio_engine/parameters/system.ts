import { VOICE_CAP } from "../synth_constants";
import { type InterpolationType, InterpolationTypes } from "../../enums";
import { SpessaSynthProcessor } from "../../processor";
import { SpessaLog } from "../../../utils/loggin";

/**
 * Global System Parameters are API-only parameters
 * that affect the entire synthesizer.
 *
 * They are System Parameters, meaning that they can only be changed via the API,
 * and not via MIDI messages.
 *
 * {@link DEFAULT_GLOBAL_SYSTEM_PARAMETERS} is provided with the library,
 * containing the defaults.
 *
 * Examples:
 *
 * - `voiceCap`
 * - `interpolationType`
 *
 * @group Synthesizer.Parameters
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
     * > **Warning**
     * >
     * > Increasing this value causes memory allocation for more voices.
     * > It is recommended to set it at the beginning, before rendering audio to avoid GC.
     * > Decreasing it does not cause memory usage change, so it's fine to use.
     */
    voiceCap: number;

    /**
     * Enabling this parameter will cause a new voice allocation when the voice cap is hit, rather than stealing existing voices.
     *
     * > **Warning**
     * >
     * > This is not recommended in real-time environments.
     */
    autoAllocateVoices: boolean;

    /**
     * The reverb effect gain.
     * From 0 to any number. 1 is 100% reverb.
     *
     * Applies to both GS and XG reverb.
     */
    reverbGain: number;

    /**
     * If the synthesizer should prevent editing of the GS reverb parameters.
     * This effect is modified using MIDI system exclusive messages, so
     * the recommended use case would be setting
     * the reverb parameters then locking it to prevent changes by MIDI files.
     */
    gsReverbLock: boolean;

    /**
     * If the synthesizer should prevent editing of the XG reverb block.
     * This effect is modified using MIDI system exclusive messages, so
     * the recommended use case would be setting
     * the reverb parameters then locking it to prevent changes by MIDI files.
     */
    xgReverbLock: boolean;

    /**
     * The chorus effect gain.
     * From 0 to any number. 1 is 100% chorus.
     *
     * Applies to both GS and XG chorus.
     */
    chorusGain: number;

    /**
     * If the synthesizer should prevent editing of the GS chorus parameters.
     * This effect is modified using MIDI system exclusive messages, so
     * the recommended use case would be setting
     * the chorus parameters then locking it to prevent changes by MIDI files.
     */
    gsChorusLock: boolean;

    /**
     * If the synthesizer should prevent editing of the XG chorus block.
     * This effect is modified using MIDI system exclusive messages, so
     * the recommended use case would be setting
     * the chorus parameters then locking it to prevent changes by MIDI files.
     */
    xgChorusLock: boolean;

    /**
     * The GS delay effect gain.
     * From 0 to any number. 1 is 100% delay.
     */
    gsDelayGain: number;

    /**
     * If the synthesizer should prevent editing of the GS delay parameters.
     * This effect is modified using MIDI system exclusive messages, so
     * the recommended use case would be setting
     * the delay parameters then locking it to prevent changes by MIDI files.
     */
    gsDelayLock: boolean;

    /**
     * The XG variation gain when in system mode. {@link XGVariationConnection}
     * From 0 to any number. 1 is 100% variation.
     */
    xgVariationGain: number;

    /**
     * If the synthesizer should prevent editing of the XG variation block.
     * This effect is modified using MIDI system exclusive messages, so
     * the recommended use case would be setting
     * the variation parameters then locking it to prevent changes by MIDI files.
     */
    xgVariationLock: boolean;

    /**
     * If the synthesizer should prevent editing of the GS insertion effect type and parameters.
     * This effect is modified using MIDI system exclusive messages, so
     * the recommended use case would be setting
     * the insertion effect type and parameters then locking it to prevent changes by MIDI files.
     *
     * > **Warning**
     * >
     * > To lock the channel insertion assign, lock the {@link ChannelMIDIParameter.efxAssign `efxAssign`} parameter instead.
     */
    gsInsertionLock: boolean;

    /**
     * If the synthesizer should prevent editing of _ALL_ the XG insertion (EFFECT 2) blocks.
     * These effects are modified using MIDI system exclusive messages, so
     * the recommended use case would be setting
     * the insertion parameters then locking them to prevent changes by MIDI files.
     */
    xgInsertionLock: boolean;

    /**
     * If the synthesizer should prevent editing of the drum parameters.
     * These params are modified using MIDI system exclusive messages or NRPN, so
     * the recommended use case would be setting
     * the drum parameters then locking it to prevent changes by MIDI files.
     */
    drumLock: boolean;

    /**
     * If the synthesizer should prevent editing of the User Drum Set (GS only) parameters.
     * These params are modified using MIDI system exclusive messages or NRPN, so
     * the recommended use case would be setting
     * the User Drum Set parameters then locking it to prevent changes by MIDI files.
     */
    userDrumLock: boolean;

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
     * The master gain.
     * From 0 to any number. 1 is 100% volume.
     */
    gain: number;

    /**
     * The master pan.
     * From -1 (left) to 1 (right). 0 is center.
     *
     * This uses the cosine panning law, so the perceived loudness remains constant as the pan changes.
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
     *
     * > **Tip**
     * >
     * > While the range of this parameter is unlimited, it is recommended to keep it in the range of -100 to 100 cents.
     * > The values above that should be applied to `keyShift` instead.
     * > For example, if the target value is 156, the recommended approach is:
     * >
     * > - `keyShift` = 1
     * > - `fineTune` = 56
     */
    fineTune: number;

    /**
     * The interpolation type used for sample playback.
     * Interpolation defines how sample points between the sample data are calculated.
     * This has high cost on performance but can improve the quality.
     */
    interpolationType: InterpolationType;

    /**
     * If the synthesizer should prevent changing any parameters via NRPN.
     */
    nrpnParamLock: boolean;

    /**
     * Indicates whether the synthesizer is in monophonic retrigger mode.
     * This emulates the behavior of Microsoft GS Wavetable Synth,
     * Where a new note will kill the previous one if it is still playing.
     */
    monophonicRetrigger: boolean;

    /**
     * If the synthesizer should use the custom vibrato implementation.
     *
     * This effect is modified using NRPN, so
     * the recommended use case would be setting
     * the custom vibrato then locking it to prevent changes by MIDI files.
     *
     * Disabled by default to avoid altering songs that don't expect it.
     */
    customVibrato: boolean;
}

/**
 * Default values for {@link GlobalSystemParameter}s.
 *
 * @group Synthesizer.Parameters
 */
export const DEFAULT_GLOBAL_SYSTEM_PARAMETERS: GlobalSystemParameter = {
    // Synth exclusive
    effectsEnabled: true,
    eventsEnabled: true,
    voiceCap: VOICE_CAP,
    autoAllocateVoices: false,

    reverbGain: 1,
    gsReverbLock: false,
    xgReverbLock: false,

    chorusGain: 1,
    gsChorusLock: false,
    xgChorusLock: false,

    gsDelayGain: 1,
    gsDelayLock: false,

    xgVariationGain: 1,
    xgVariationLock: false,

    gsInsertionLock: false,
    xgInsertionLock: false,

    drumLock: false,
    userDrumLock: false,

    blackMIDIMode: false,
    deviceID: -1,

    // Shared with channel
    gain: 1,
    pan: 0,
    keyShift: 0,
    fineTune: 0,

    interpolationType: InterpolationTypes.hermite,
    nrpnParamLock: false,
    monophonicRetrigger: false,
    customVibrato: false
};

/**
 * Sets a system parameter of the synthesizer.
 * @param parameter The type of the system parameter to set.
 * @param value The value to set for the system parameter.
 */
export function setSystemParameterInternal<
    P extends keyof GlobalSystemParameter
>(this: SpessaSynthProcessor, parameter: P, value: GlobalSystemParameter[P]) {
    if (this.systemParameters[parameter] === value) return;
    const prev = this.systemParameters[parameter];
    // @ts-expect-error Only setter here, readonly for consumers
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
            // @ts-expect-error Only setter here, readonly for consumers
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
            if ((prev as number) !== (value as number)) this.stopAll(true);
        }
    }
}
