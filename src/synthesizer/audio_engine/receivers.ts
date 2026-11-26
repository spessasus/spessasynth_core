import type { SpessaSynthProcessor } from "../processor";
import type { MIDIChannel } from "./channel/midi_channel";

/**
 * The receive list of a channel number no channel listens to.
 */
const NO_RECEIVERS = new Array<MIDIChannel>();

/**
 * The channels that receive a channel message, from the receive table.
 * The F5 port select offset applies here, so it works with the receive channels too.
 * @param channel The channel number of the message.
 */
export function receiversOfInternal(
    this: SpessaSynthProcessor,
    channel: number
) {
    if (this.receiversDirty) {
        this.receiversDirty = false;
        // New lists instead of refilling the old ones: an event listener may change the routing
        // While a message is still going through a list. Rebuilds only happen on Rx changes and resets
        this.receivers.length = 0;
        for (const ch of this.midiChannels) {
            const rx = ch.midiParameters.rxChannel;
            // -1 is OFF
            if (rx < 0) continue;
            (this.receivers[rx] ??= new Array<MIDIChannel>()).push(ch);
        }
    }
    return (
        this.receivers[channel + this.portSelectChannelOffset] ?? NO_RECEIVERS
    );
}
