import type { SpessaSynthSequencer } from "./sequencer";

/**
 * Processes a single MIDI tick.
 * Call this every rendering quantum to process the sequencer events in real-time.
 */
export function processTick(this: SpessaSynthSequencer) {
    if (!this.playing) {
        return;
    }
    const currentTime = this.currentTime;
    while (this.playedTime < currentTime) {
        // find the next event and process it
        const trackIndex = this.findFirstEventIndex();
        const track = this._midiData.tracks[trackIndex];
        const event = track.events[this.eventIndexes[trackIndex]++];
        this.processEvent(event, trackIndex);

        const canLoop = this.loopCount > 0;

        // find the next event
        const nextTrackIndex = this.findFirstEventIndex();
        const nextTrack = this._midiData.tracks[nextTrackIndex];
        // check for loop
        if (
            // events
            nextTrack.events.length <= this.eventIndexes[nextTrackIndex] ||
            // loop
            this._midiData.loop.end <= event.ticks
        ) {
            if (canLoop) {
                // loop
                if (this.loopCount !== Infinity) {
                    this.loopCount--;
                    this?.onEventCall?.("loopCountChange", {
                        newCount: this.loopCount
                    });
                }
                this.setTimeTicks(this._midiData.loop.start);
                return;
            }
            // stop the playback
            this.songIsFinished();
            return;
        }

        const eventNext = nextTrack.events[this.eventIndexes[nextTrackIndex]];
        this.playedTime +=
            this.oneTickToSeconds * (eventNext.ticks - event.ticks);
    }
}
