import type { SpessaSynthSequencer } from "./sequencer";

/**
 * Processes a single MIDI tick.
 * Call this every rendering quantum to process the sequencer events in real-time.
 */
export function processTick(this: SpessaSynthSequencer) {
    if (!this.playing) {
        return;
    }
    const current = this.currentTime;
    while (this.playedTime < current) {
        // find the next event
        let trackIndex = this.findFirstEventIndex();
        const event =
            this.midiData.tracks[trackIndex][this.eventIndexes[trackIndex]];
        this.processEvent(event, trackIndex);

        this.eventIndexes[trackIndex]++;

        // find the next event
        trackIndex = this.findFirstEventIndex();
        if (
            this.midiData.tracks[trackIndex].length <=
            this.eventIndexes[trackIndex]
        ) {
            // the song has ended
            if (this.loop) {
                this.setTimeTicks(this.midiData.loop.start);
                return;
            }
            this.eventIndexes[trackIndex]--;
            this.songIsFinished();
            return;
        }
        const eventNext =
            this.midiData.tracks[trackIndex][this.eventIndexes[trackIndex]];
        this.playedTime +=
            this.oneTickToSeconds * (eventNext.ticks - event.ticks);

        const canLoop =
            this.loop && (this.loopCount > 0 || this.loopCount === -1);

        // if we reached loop.end
        if (this.midiData.loop.end <= event.ticks && canLoop) {
            // loop
            if (this.loopCount !== Infinity) {
                this.loopCount--;
                this?.onLoopCountChange?.(this.loopCount);
            }
            this.setTimeTicks(this.midiData.loop.start);
            return;
        }
        // if the song has ended
        else if (current >= this.duration) {
            if (canLoop) {
                // loop
                if (this.loopCount !== Infinity) {
                    this.loopCount--;
                    this?.onLoopCountChange?.(this.loopCount);
                }
                this.setTimeTicks(this.midiData.loop.start);
                return;
            }
            // stop the playback
            this.eventIndexes[trackIndex]--;
            this.songIsFinished();
            return;
        }
    }
}
