export interface CustomChannelVibrato {
    /**
     * Vibrato depth, as gain.
     */
    depth: number;
    /**
     * Vibrato delay, in seconds from the voice's start time.
     */
    delay: number;
    /**
     * Vibrato rate in Hertz.
     */
    rate: number;
}

export type { ChannelSnapshot } from "./channel_snapshot";
export type { ChannelGenerators } from "./awe32_nrpn";
