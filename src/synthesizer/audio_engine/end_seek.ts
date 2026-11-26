import type { SpessaSynthProcessor } from "../processor";

/**
 * Ends a sequencer seek: updates the sounding voices once and sends the held back controller events.
 */
export function endSeekInternal(this: SpessaSynthProcessor) {
    this.seeking = false;
    // The modulators the replayed controllers skipped (-1: every source)
    for (const channel of this.midiChannels)
        channel.computeModulatorsAll(-1, 0);
    // Taken off first, so a listener that throws doesn't leave them for the next seek
    const events = [...this.seekEvents.values()];
    this.seekEvents.clear();
    // With the values the channels have now: a reset during the seek may have changed them without an event
    for (const event of events) {
        if (event.type === "controllerChange") {
            const ch = this.midiChannels[event.data.channel];
            event.data.value = ch.midiControllers[event.data.controller] >> 7;
        } else if (
            event.type === "channelParamChange" &&
            event.data.parameter === "pitchWheel"
        ) {
            event.data.value =
                this.midiChannels[event.data.channel].midiParameters.pitchWheel;
        }
        this.onEventCall?.(event);
    }
}
