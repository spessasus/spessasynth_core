import type { MIDIChannel } from "./midi_channel";

/**
 * The master parameters of the channel.
 */
export interface ChannelMasterParameter {
    /**
     * The master gain, from 0 to any number. 1 is 100% volume.
     */
    gain: number;
    /**
     * The master pan, from -1 (left) to 1 (right). 0 is center.
     */
    pan: number;

    /**
     * If the channel is muted.
     */
    isMuted: boolean;
    /**
     * The global pitch offset in semitones. It can be decimal to provide microtonal tuning.
     */
    pitchOffset: number;

    /**
     * If the preset is locked, preventing any program changes from being sent.
     */
    presetLock: boolean;
}

export const DEFAULT_CHANNEL_MASTER_PARAMETERS: ChannelMasterParameter = {
    gain: 1,
    pan: 0,
    pitchOffset: 0,
    isMuted: false,
    presetLock: false
};

/**
 * Sets a master parameter of the channel
 * @param parameter The type of the master parameter to set.
 * @param value The value to set for the master parameter.
 */
export function setMasterParameter<P extends keyof ChannelMasterParameter>(
    this: MIDIChannel,
    parameter: P,
    value: ChannelMasterParameter[P]
) {
    if (this._masterParameters[parameter] === value) return;
    const prev = this._masterParameters[parameter];
    // @ts-expect-error We only set it here.
    this._masterParameters[parameter] = value;
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

        case "pitchOffset": {
            const t = value as number;
            if (!this.drumChannel) {
                const keyShift = Math.trunc(t);
                if (Math.trunc(prev as number) !== keyShift)
                    this.stopAllNotes(true);
            }
        }
    }
}
