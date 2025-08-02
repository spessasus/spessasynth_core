import type { SpessaSynthSequencer } from "./sequencer";

/**
 * Processes a single MIDI tick.
 * Call this every rendering quantum to process the sequencer events in real-time.
 */
export function processTick(this: SpessaSynthSequencer) {
    if (this.paused) {
        return;
    }
    const currentTime = this.currentTime;
    while (this.playedTime < currentTime) {
        // Find the next event and process it
        const trackIndex = this.findFirstEventIndex();
        const track = this._midiData.tracks[trackIndex];
        const event = track.events[this.eventIndexes[trackIndex]++];
        this.processEvent(event, trackIndex);

        const canLoop = this.loopCount > 0;

        // Find the next event
        const nextTrackIndex = this.findFirstEventIndex();
        const nextTrack = this._midiData.tracks[nextTrackIndex];
        // Check for loop
        if (
            // Events
            nextTrack.events.length <= this.eventIndexes[nextTrackIndex] ||
            // Loop
            this._midiData.loop.end <= event.ticks
        ) {
            if (canLoop) {
                // Loop
                if (this.loopCount !== Infinity) {
                    this.loopCount--;
                    this.callEvent("loopCountChange", {
                        newCount: this.loopCount
                    });
                }
                this.setTimeTicks(this._midiData.loop.start);
                return;
            }
            // Stop the playback
            this.songIsFinished();
            return;
        }

        const eventNext = nextTrack.events[this.eventIndexes[nextTrackIndex]];
        this.playedTime +=
            this.oneTickToSeconds * (eventNext.ticks - event.ticks);
    }
}
