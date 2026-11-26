import type { MIDIMessage } from "../midi/midi_message";
import { MIDIMessageTypes } from "../midi/enums";
import type { SpessaSynthSequencer } from "./sequencer";
import { readBigEndian } from "../utils/byte_functions/big_endian";
import { setTimeToExternal } from "./seek_external";

/**
 * Plays the MIDI file to a specific time or ticks.
 *
 * For the internal synthesizer every event goes through the same path as in playback, so the synthesizer ends up
 * in the same state (receive channels, resets, effects, portamento and the parts each message reaches all follow
 * the synth's own rules). The synth plays nothing while seeking (notes only update their bookkeeping)
 * and its controller events are merged into one per value.
 * External playback can't send every message again, it has its own seek ({@link setTimeToExternal}).
 * @param time in seconds.
 * @param ticks optional MIDI ticks, when given is used instead of time.
 * @returns true if the MIDI file is not finished.
 */
export function setTimeToInternal(
    this: SpessaSynthSequencer,
    time: number,
    ticks: number | undefined = undefined
): boolean {
    if (this.externalMIDIPlayback)
        return setTimeToExternal.call(this, time, ticks);
    if (!this._midiData) {
        return false;
    }
    this.oneTickToSeconds = 60 / (120 * this._midiData.timeDivision);
    // Reset everything
    this.sendMIDIReset();
    this.playedTime = 0;
    this.index = 0;

    // Save tempo changes
    // Testcase:
    // Piano Concerto No. 2 in G minor, Op 16 - I. Cadenza (Ky6000).mid
    // With 46k changes!
    let savedTempo: MIDIMessage | undefined = undefined;
    let savedTempoTrack = 0;

    // The seeking mode always ends, also when a message handler throws
    try {
        this.synth.seeking = true;
        const { timeline, tracks } = this._midiData;
        // Start with the same ports as a fresh playback, MIDI port events update them
        this.ports!.reset();

        while (true) {
            // Find the next event
            const e = timeline[this.index];
            if (e === undefined) {
                this.stop();
                return false;
            }
            const trackIndex = e.tr;
            const event = tracks[trackIndex].events[e.ev];
            if (ticks === undefined) {
                if (this.playedTime >= time) break;
            } else if (event.ticks >= ticks) break;

            if (event.statusByte === MIDIMessageTypes.setTempo) {
                const tempoBPM = 60_000_000 / readBigEndian(event.data, 3);
                this.oneTickToSeconds =
                    60 / (tempoBPM * this._midiData.timeDivision);
                savedTempo = event;
                savedTempoTrack = trackIndex;
            } else this.processEvent(event, trackIndex);

            // Find the next event
            const nE = timeline[++this.index];
            if (nE === undefined) {
                this.stop();
                return false;
            }
            const nextEvent = tracks[nE.tr].events[nE.ev];
            this.playedTime +=
                this.oneTickToSeconds * (nextEvent.ticks - event.ticks);
        }
    } finally {
        // The notes held at the target never sounded, resuming must not strike them again
        for (const notes of this.playingNotes) notes.clear();
        this.synth.endSeek();
    }

    // Restoring tempo
    if (savedTempo) {
        this.callEvent("metaEvent", {
            event: savedTempo,
            trackIndex: savedTempoTrack
        });
    }

    // Restoring paused time
    if (this.paused) {
        this.pausedTime = this.playedTime;
    }

    return true;
}
