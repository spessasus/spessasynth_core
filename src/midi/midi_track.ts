import { MIDIMessage } from "./midi_message";
import { IndexedByteArray } from "../utils/indexed_array";

export class MIDITrack {
    /**
     * The name of this track.
     */
    public name = "";
    /**
     * The MIDI port number used by the track.
     */
    public port = 0;
    /**
     * A set that contains the MIDI channels used by the track in the sequence.
     */
    public channels = new Set<number>();
    /**
     * All the MIDI messages of this track.
     */
    public events: Omit<MIDIMessage[], "push" | "splice"> = [];

    public static copyFrom(track: MIDITrack) {
        const t = new MIDITrack();
        t.copyFrom(track);
        return t;
    }

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
     * Adds an event to the track.
     * @param event The event to add.
     * @param index The index at which to add this event.
     */
    public addEvent(event: MIDIMessage, index: number) {
        (this.events as MIDIMessage[]).splice(index, 0, event);
    }

    /**
     * Removes an event from the track.
     * @param index The index of the event to remove.
     */
    public deleteEvent(index: number) {
        (this.events as MIDIMessage[]).splice(index, 1);
    }

    /**
     * Appends an event to the end of the track.
     * @param event The event to add.
     */
    public pushEvent(event: MIDIMessage) {
        (this.events as MIDIMessage[]).push(event);
    }
}
