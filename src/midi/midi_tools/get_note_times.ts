import { IndexedByteArray } from "../../utils/indexed_array";
import { readBigEndian } from "../../utils/byte_functions/big_endian";
import { DEFAULT_PERCUSSION } from "../../synthesizer/audio_engine/synth_constants";
import type { BasicMIDI } from "../basic_midi";
import type { MIDIMessage } from "../midi_message";
import type { NoteTime } from "../types";

/**
 * Gets tempo from the midi message
 * @param event the midi event
 * @return the tempo in bpm
 */
const getTempo = (event: MIDIMessage): number => {
    // Simulate IndexedByteArray
    event.data = new IndexedByteArray(event.data.buffer);
    return 60_000_000 / readBigEndian(event.data, 3);
};

/**
 * Calculates all note times in seconds.
 * @param midi the midi to use
 * @param minDrumLength the shortest a drum note (channel 10) can be, in seconds.
 * @returns an array of 16 channels, each channel containing its notes,
 * with their key number, velocity, absolute start time and length in seconds.
 */
export function getNoteTimesInternal(
    midi: BasicMIDI,
    minDrumLength = 0
): NoteTime[][] {
    /**
     * An array of 16 arrays (channels)
     */
    const noteTimes: NoteTime[][] = [];
    // Flatten and sort by ticks

    for (let i = 0; i < 16; i++) noteTimes.push([]);

    let elapsedTime = 0;
    let oneTickToSeconds = 60 / (120 * midi.timeDivision);
    let i = 0;
    let unfinished = 0;
    // Store notes that we started but didn't finish
    // MIDI note: index to the note time
    const unfinishedNotes: Map<number, number>[] = [];
    for (let i = 0; i < 16; i++) unfinishedNotes.push(new Map());

    const noteOff = (midiNote: number, channel: number) => {
        const ch = unfinishedNotes[channel];
        const noteIndex = ch.get(midiNote);

        if (noteIndex === undefined) return;
        const note = noteTimes[channel][noteIndex];

        const time = elapsedTime - note.start;
        note.length =
            channel === DEFAULT_PERCUSSION
                ? Math.max(time, minDrumLength)
                : time;

        ch.delete(midiNote);
        unfinished--;
    };
    const { timeline, tracks } = midi;
    while (i < timeline.length) {
        const e = timeline[i];
        const event = tracks[e.tr].events[e.ev];

        const status = event.statusByte >> 4;
        const channel = event.statusByte & 0x0f;

        // Note off
        if (status === 0x8) noteOff(event.data[0], channel);
        // Note on
        else if (status === 0x9) {
            const midiNote = event.data[0];
            const velocity = event.data[1];
            if (velocity === 0) {
                // Never mind, its note off
                noteOff(midiNote, channel);
            } else {
                // Stop previous
                noteOff(midiNote, channel);
                const noteTime = {
                    midiNote,
                    start: elapsedTime,
                    length: -1,
                    velocity
                };
                const times = noteTimes[channel];
                times.push(noteTime);
                unfinishedNotes[channel].set(midiNote, times.length - 1);
                unfinished++;
            }
        }
        // Set tempo
        else if (event.statusByte === 0x51)
            oneTickToSeconds = 60 / (getTempo(event) * midi.timeDivision);

        if (++i >= timeline.length) break;

        elapsedTime +=
            oneTickToSeconds *
            (tracks[timeline[i].tr].events[timeline[i].ev].ticks - event.ticks);
    }

    // Finish the unfinished notes
    if (unfinished > 0) {
        // For every channel, for every note that is unfinished (has -1 length)
        for (let channel = 0; channel < unfinishedNotes.length; channel++) {
            for (const noteIndex of unfinishedNotes[channel].values()) {
                const note = noteTimes[channel][noteIndex];
                note.length = elapsedTime - note.start;
            }
        }
    }
    return noteTimes;
}
