import type { MIDIChannel } from "../midi_channel";
import type { InterpolationType } from "../../../enums";

/**
 * The system parameters of the channel.
 * These can only be changed via the API.
 */
export interface ChannelSystemParameter {
    // Channel exclusive
    /**
     * If the preset is locked, preventing any program changes from being sent.
     */
    presetLock: boolean;

    /**
     * If the channel is muted.
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
     */
    keyShift: number;

    /**
     * The channel tuning in cents.
     */
    fineTune: number;

    /**
     * The interpolation type used for sample playback.
     *
     * Overrides the global parameter if set.
     */
    interpolationType: InterpolationType | null;

    /**
     * If the channel should prevent applying the custom vibrato.
     * This effect is modified using NRPN, so
     * the recommended use case would be setting
     * the custom vibrato then locking it to prevent changes by MIDI files.
     *
     * Overrides the global parameter if set.
     */
    customVibratoLock: boolean | null;

    /**
     * If the channel should prevent changing any parameters via NRPN.
     * This includes the custom vibrato parameters.
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
    customVibratoLock: null,
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
            if (!this.drumChannel && (prev as number) !== (value as number))
                this.stopAllNotes(true);
        }
    }
}
