import type { MIDIChannel } from "../midi_channel";
import type { InterpolationType } from "../../../enums";

/**
 * Channel System Parameters are API-only parameters
 * that affect a single MIDI channel.
 *
 * Parameters that also appear at
 * the global level can be overridden at the channel level.
 *
 * They are System Parameters, meaning that they can only be changed via the API,
 * and not via MIDI messages.
 *
 * {@link DEFAULT_CHANNEL_SYSTEM_PARAMETERS} is provided with the library,
 * containing the defaults.
 *
 * Examples:
 *
 * - `presetLock`
 * - `isMuted`
 *
 * @group Synthesizer.Parameters
 */
export interface ChannelSystemParameter {
    // Channel exclusive
    /**
     * If the preset is locked, preventing any program changes from being sent.
     */
    presetLock: boolean;

    /**
     * If the channel should not produce any sound
     * and ignore incoming Note On messages.
     */
    isMuted: boolean;

    // Shared with synth
    /**
     * The gain for the channel.
     * From 0 to any number. 1 is 100% volume.
     */
    gain: number;
    /**
     * The panning of the channel.
     * -1 (left) to 1 (right). 0 is center.
     */
    pan: number;

    /**
     * The channel key shift in semitones.
     * Drum channels DO NOT ignore this value.
     *
     * > **Tip**
     * >
     * > Avoid setting this for drum channels as it may break the drum key mapping.
     */
    keyShift: number;

    /**
     * The channel tuning in cents.
     * Drum channels DO NOT ignore this value.
     *
     * > **Tip**
     * >
     * > While the range of this parameter is unlimited, it is recommended to keep it in the range of -100 to 100 cents.
     * > The values above that should be applied to {@link ChannelSystemParameter.keyShift} instead.
     * > For example, if the target value is 156, the recommended approach is:
     * >
     * > - `keyShift` = 1
     * > - `fineTune` = 56
     * >   Note that this approach shouldn't be taken for drum channels, as key shift will break them.
     */
    fineTune: number;

    /**
     * The interpolation type used for sample playback.
     * Interpolation defines how sample points between the sample data are calculated.
     * This has high cost on performance but can improve the quality.
     *
     *
     * Overrides the global parameter if set.
     */
    interpolationType: InterpolationType | null;

    /**
     * If the channel should prevent changing any parameters via NRPN.
     *
     * Overrides the global parameter if set.
     */
    nrpnParamLock: boolean | null;

    /**
     * Indicates whether the channel is in monophonic retrigger mode.
     * This emulates the behavior of Microsoft GS Wavetable Synth,
     * Where a new note will kill the previous one if it is still playing.
     *
     * Overrides the global parameter if set.
     */
    monophonicRetrigger: boolean | null;
}

/**
 * Default values for {@link ChannelSystemParameter}s.
 *
 * @group Synthesizer.Parameters
 */
export const DEFAULT_CHANNEL_SYSTEM_PARAMETERS: ChannelSystemParameter = {
    // Channel exclusive
    presetLock: false,
    isMuted: false,

    // Shared with synth
    gain: 1,
    pan: 0,
    keyShift: 0,
    fineTune: 0,

    interpolationType: null,
    nrpnParamLock: null,
    monophonicRetrigger: null
};

/**
 * Sets a system parameter of the channel
 * @param parameter The type of the system parameter to set.
 * @param value The value to set for the system parameter.
 */
export function setSystemParameterInternal<
    P extends keyof ChannelSystemParameter
>(this: MIDIChannel, parameter: P, value: ChannelSystemParameter[P]) {
    if (this._systemParameters[parameter] === value) return;
    const prev = this._systemParameters[parameter];
    // @ts-expect-error We only set it here.
    this._systemParameters[parameter] = value;
    this.updateInternalParams();
    // Additional handling for specific parameters
    switch (parameter) {
        default: {
            break;
        }

        case "presetLock": {
            if (value as boolean)
                this.lockedSystem = this.synthCore.midiParameters.system;
            break;
        }

        case "isMuted": {
            if (value as boolean) this.stopAllNotes(true);
            break;
        }

        case "keyShift": {
            if (!this._drumChannel && (prev as number) !== (value as number))
                this.stopAllNotes(true);
        }
    }
}
