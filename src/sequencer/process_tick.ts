import type { SpessaSynthSequencer } from "./sequencer";

/**
 * Processes a single MIDI tick.
 * Call this every rendering quantum to process the sequencer events in real-time.
 */
export function processTick(this: SpessaSynthSequencer) {
    if (this.paused || !this._midiData) {
        return;
    }
    const currentTime = this.currentTime;
    while (this.playedTime < currentTime) {
        // Find the next event and process it
        const { timeline, tracks, lastVoiceEventTick, loop } = this._midiData;
        const e = timeline[this.index++];
        const event = tracks[e.tr].events[e.ev];
        this.processEvent(event, e.tr);

        // Check for loop
        if (this.loopCount > 0 && loop.end <= event.ticks) {
            if (this.loopCount !== Infinity) {
                this.loopCount--;
                this.callEvent("loopCountChange", {
                    newCount: this.loopCount
                });
            }
            if (loop.type === "soft") this.jumpToTick(loop.start);
            else this.setTimeTicks(loop.start);

            return;
        }
        // Check for end of track
        if (
            this.index >= timeline.length ||
            // https://github.com/spessasus/spessasynth_core/issues/21
            event.ticks >= lastVoiceEventTick
        ) {
            // Stop the playback
            this.songIsFinished();
            return;
        }

        const nE = timeline[this.index];
        const nextEvent = tracks[nE.tr].events[nE.ev];
        this.playedTime +=
            this.oneTickToSeconds * (nextEvent.ticks - event.ticks);
    }
}
