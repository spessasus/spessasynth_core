import { isNoteOn, MIDIMessage } from "../../midi_message";
import type { BasicMIDI } from "../../basic_midi";
import { MIDIMessageTypes } from "../../enums";
import { PortTracker } from "../port_tracker";

/**
 * A MIDI Port meta event.
 * @param ticks The ticks.
 * @param port The port number.
 */
const portEvent = (ticks: number, port: number) =>
    new MIDIMessage(ticks, MIDIMessageTypes.midiPort, new Uint8Array([port]));

/**
 * The editor's position in `BasicMIDI.iterate`, with the inserts and deletes around the current event.
 *
 * `iterate` owns the event index array. The current track's index points at the current event
 * and moves forward after the callback, the other tracks' indexes point at their next event.
 * So the cursor keeps the indexes in step with the edits:
 * - Inserted events are not visited, unless they land after the next event of their track.
 * - Deleting an event that was already visited (the current one included) moves the index back by one.
 *   After deleting the current event, the cursor points at the event before it.
 *
 * It also carries {@link parameterChannel}, the one bit of editor state that is per event,
 * so {@link begin} resets it with the rest.
 * @internal
 */
export class EventCursor {
    /**
     * The channel (with the port offset) of the N/RPN data entry being handled, otherwise -1.
     * Deleting the current event deletes the whole parameter while it is set.
     */
    public parameterChannel = -1;
    private readonly midi;
    /**
     * Called after an event was deleted, so cached event indexes can be moved.
     */
    private readonly onDelete;
    /**
     * Called after an event was inserted.
     */
    private readonly onInsert;
    /**
     * The current event index of every track, owned by `iterate`.
     */
    private eventIndexes = [0];
    private currentTrack = 0;
    private currentDeleted = false;
    /**
     * The port and the closing MIDI Port event of the last {@link insertBeforeOnPort}, so the next one can join it.
     */
    private lastWrap?: { port: number; restore: MIDIMessage };

    /**
     * @param midi The file being edited.
     * @param onDelete Called after an event was deleted, with its track and its index before the delete.
     * @param onInsert Called after an event was inserted, with the event, its track
     * and the port it was put on with {@link insertBeforeOnPort} (undefined for the track's own port).
     */
    public constructor(
        midi: BasicMIDI,
        onDelete: (track: number, index: number) => unknown,
        onInsert: (
            e: MIDIMessage,
            track: number,
            port: number | undefined
        ) => unknown
    ) {
        this.midi = midi;
        this.onDelete = onDelete;
        this.onInsert = onInsert;
    }

    /**
     * The index of the track of the current event.
     */
    public get track() {
        return this.currentTrack;
    }

    /**
     * If the current event has already been deleted.
     */
    public get deleted() {
        return this.currentDeleted;
    }

    /**
     * The index of the current event in its track.
     * After the current event was deleted, this is the index of the event before it.
     */
    public get index() {
        return this.eventIndexes[this.currentTrack];
    }

    /**
     * The current event.
     * @throws Error if it was deleted. The index then points at the event before it.
     */
    public get event() {
        if (this.currentDeleted)
            throw new Error("The current event was deleted.");
        return this.midi.tracks[this.currentTrack].events[this.index];
    }

    /**
     * Moves the cursor to a new event, called for every event of `iterate`.
     * @param track The index of the track the event is on.
     * @param eventIndexes The current event index of every track, owned by `iterate`.
     */
    public begin(track: number, eventIndexes: number[]) {
        this.currentTrack = track;
        this.eventIndexes = eventIndexes;
        this.currentDeleted = false;
        this.parameterChannel = -1;
    }

    /**
     * Adds the events before the current one IN ORDER they are in the array,
     * So the first event in the array will end up as the first one before the current event.
     * @param events The events to insert.
     */
    public insertBefore(...events: MIDIMessage[]) {
        // After deleting the current event, the index points at the event before it,
        // So the current event's place is one further
        const offset = this.currentDeleted ? 1 : 0;
        this.insertAt(this.currentTrack, this.index + offset, events);
    }

    /**
     * Adds channel messages for another port before the current event, like {@link insertBefore}.
     * They are written as `MIDI Port <port>`, the messages, `MIDI Port <trackPort>`, on the ticks of the messages,
     * so the track's port stays the same for everything else.
     * A wrap right after the previous one for the same port joins it, as nothing sits between them.
     * A joined wrap can span several ticks, the track is on the other port in between.
     * That's fine because the cursor only inserts around the current event, never inside an earlier wrap.
     * The setup for a cleared system goes in after the walk, after the meta events at its tick,
     * so it can land inside a wrap there. That's fine too because it only has global parameters.
     * @param port The port the messages are for.
     * @param trackPort The current port of the track.
     * @param events The messages to insert.
     * @returns False if nothing was inserted because a port event would change the file's port routing.
     */
    public insertBeforeOnPort(
        port: number,
        trackPort: number,
        ...events: MIDIMessage[]
    ) {
        if (events.length === 0) return true;
        const ticks = events[0].ticks;
        const trackEvents = this.midi.tracks[this.currentTrack].events;
        // Where insertBefore puts the events
        const index = this.index + (this.currentDeleted ? 1 : 0);
        const last = this.lastWrap;
        const joins =
            last?.port === port && trackEvents[index - 1] === last.restore;
        // A track starts on its first MIDI Port event, the events before it included
        const firstPort = joins
            ? 0
            : trackEvents.findIndex((e) => PortTracker.isPortEvent(e));
        // A track with notes and no port event at all gets its port from the file
        // (the lowest port with notes, or its track name). Its first port event would change how
        // `BasicMIDI` assigns the port channels for the whole file, track-name routing switches off entirely
        if (firstPort === -1 && trackEvents.some((e) => isNoteOn(e)))
            return false;
        const restore = portEvent(ticks, trackPort);
        this.lastWrap = { port, restore };
        let at = index;
        if (joins) {
            // The events go in place of the old restore. A new one closes the wrap,
            // The old one could have earlier ticks and would sort before the events
            this.deleteAt(this.currentTrack, index - 1);
            at--;
        } else {
            const start = [portEvent(ticks, port)];
            // Without a port event before this one, the track would start on the wrapped port,
            // So the track's port goes first. That's safe for a track without notes, it plays nothing.
            if (firstPort === -1 || firstPort >= index)
                start.unshift(portEvent(ticks, trackPort));
            this.insertAt(this.currentTrack, at, start);
            at += start.length;
        }
        this.insertAt(this.currentTrack, at, events, port);
        this.insertAt(this.currentTrack, at + events.length, [restore]);
        return true;
    }

    /**
     * Adds the events after the current one IN ORDER they are in the array,
     * So the first event in the array will end up as the first one after the current event.
     * @param events The events to insert.
     */
    public insertAfter(...events: MIDIMessage[]) {
        this.insertAt(this.currentTrack, this.index + 1, events);
    }

    /**
     * Deletes the current event, once.
     */
    public deleteCurrent() {
        if (this.currentDeleted) return;
        this.currentDeleted = true;
        this.deleteAt(this.currentTrack, this.index);
    }

    /**
     * Deletes an event from a track and keeps the loop position valid.
     *
     * The parameter trackers cache absolute event indexes so a whole N/RPN group can be removed later.
     * Whenever an event is deleted, the loop position and every cached index that comes
     * after the deleted event must shift down by one, otherwise a later cleanup
     * would delete the wrong events. The cached indexes are moved in `onDelete`.
     * Testcase: midi_editor_nrpn_test.ts (Case: interleaved NRPN between channels)
     * @param track The track to delete the event from.
     * @param index The index of the event to delete.
     */
    public deleteAt(track: number, index: number) {
        this.midi.tracks[track].deleteEvent(index);

        // Move the loop back if we deleted the current (or a previous) event.
        // This prevents it from skipping over the shifted events.
        if (index < this.nextIndex(track)) {
            this.eventIndexes[track]--;
        }
        this.onDelete(track, index);
    }

    /**
     * Replaces the current event in place.
     * @param e The new event.
     * @throws Error if the current event was deleted.
     */
    public replaceCurrent(e: MIDIMessage) {
        if (this.currentDeleted)
            throw new Error("The current event was deleted.");
        this.midi.tracks[this.currentTrack].events[this.index] = e;
    }

    /**
     * Inserts the events at an index of a track IN ORDER they are in the array.
     * Events inserted up to the next event of the track are not visited.
     * Private, because inserting does not move the N/RPN indexes the parameter trackers cache
     * (`onDelete` does that for deletes). Inserting around the current event never lands before them.
     * @param track The track to insert into.
     * @param index The index the first event goes to.
     * @param events The events to insert.
     * @param port The port the events are for, if not the track's current one.
     */
    private insertAt(
        track: number,
        index: number,
        events: MIDIMessage[],
        port?: number
    ) {
        for (const item of events) {
            this.midi.tracks[track].addEvents(index, item);
            // Move the loop past it, so it is not visited
            if (index <= this.nextIndex(track)) this.eventIndexes[track]++;
            index++;
            this.onInsert(item, track, port);
        }
    }

    /**
     * The index of the next event `iterate` visits on a track.
     * @param track The track.
     */
    private nextIndex(track: number) {
        return this.eventIndexes[track] + (track === this.currentTrack ? 1 : 0);
    }
}
