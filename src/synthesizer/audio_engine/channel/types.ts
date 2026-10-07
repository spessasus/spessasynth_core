/**
 * Represents the [custom channel vibrato](../../../../docs/extra/midi-implementation.md#custom-vibrato)
 * of the channel.
 *
 * @group Synthesizer.Channel
 */
export interface CustomChannelVibrato {
    /**
     * Vibrato depth, in cents.
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
