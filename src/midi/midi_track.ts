import { MIDIMessage } from "./midi_message";
import { IndexedByteArray } from "../utils/indexed_array";

/**
 * This class represents a single MIDI track in a {@link BasicMIDI} sequence.
 *
 * @group MIDI.Sequence
 */
export class MIDITrack {
    /**
     * The name of this track.
     * Empty if the track has no name.
     */
    public name = "";
    /**
     * The MIDI port number the track starts on (its first MIDI Port event).
     * MIDI Port events later in the track switch it during playback.
     * A track without any MIDI Port event uses the lowest port that plays notes (0 if there is none).
     * This port may play no notes itself, so it can have no entry in {@link BasicMIDI.portChannelOffsetMap}.
     */
    public port = 0;
    /**
     * A set that contains the MIDI channel numbers (0-15) that have note on events in this track.
     */
    public channels = new Set<number>();
    /**
     * All the MIDI messages of this track, ordered by their tick time.
     */
    public events: Omit<
        MIDIMessage[],
        "push" | "splice" | "shift" | "unshift"
    > = [];

    /**
     * Creates a copy of a `MIDITrack`.
     * @param track The track to copy.
     * @returns The new copy.
     */
    public static copyFrom(track: MIDITrack) {
        const t = new MIDITrack();
        t.copyFrom(track);
        return t;
    }

    /**
     * Copies a `MIDITrack` into this track.
     * @param track The track to copy.
     */
    public copyFrom(track: MIDITrack) {
        this.name = track.name;
        this.port = track.port;
        this.channels = new Set(track.channels);
        this.events = track.events.map(
            (e) =>
                new MIDIMessage(
                    e.ticks,
                    e.statusByte,
                    new IndexedByteArray(e.data)
                )
        );
    }

    /**
     * Adds events to the track.
     * @param index The index at which to add these events.
     * @param events The events to add.
     */
    public addEvents(index: number, ...events: MIDIMessage[]) {
        (this.events as MIDIMessage[]).splice(index, 0, ...events);
    }

    /**
     * Removes an event from the track.
     * @param index The index of the event to remove.
     */
    public deleteEvent(index: number) {
        (this.events as MIDIMessage[]).splice(index, 1);
    }

    /**
     * Appends events to the end of the track.
     * @param events The events to add.
     */
    public pushEvents(...events: MIDIMessage[]) {
        (this.events as MIDIMessage[]).push(...events);
    }
}
