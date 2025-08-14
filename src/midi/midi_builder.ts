import { BasicMIDI } from "./basic_midi";
import { MIDIMessage } from "./midi_message";
import { IndexedByteArray } from "../utils/indexed_array";
import { type MIDIMessageType, midiMessageTypes } from "./enums";
import { MIDITrack } from "./midi_track";

/**
 * A class that helps to build a MIDI file from scratch.
 */
export class MIDIBuilder extends BasicMIDI {
    private encoder = new TextEncoder();

    /**
     * Creates a new MIDI file.
     * @param name The MIDI's name.
     * @param timeDivision the file's time division (ticks per quarter note).
     * @param initialTempo the file's initial tempo.
     */
    public constructor(name: string, timeDivision = 480, initialTempo = 120) {
        super();
        this.timeDivision = timeDivision;
        this.name = name;

        // Create the first track with the file name
        this.addNewTrack(name);
        this.addSetTempo(0, initialTempo);
    }

    /**
     * Adds a new Set Tempo event.
     * @param ticks the tick number of the event.
     * @param tempo the tempo in beats per minute (BPM).
     */
    public addSetTempo(ticks: number, tempo: number) {
        const array = new IndexedByteArray(3);

        tempo = 60000000 / tempo;

        // Extract each byte in big-endian order
        array[0] = (tempo >> 16) & 0xff;
        array[1] = (tempo >> 8) & 0xff;
        array[2] = tempo & 0xff;

        this.addEvent(ticks, 0, midiMessageTypes.setTempo, array);
    }

    /**
     * Adds a new MIDI track.
     * @param name the new track's name.
     * @param port the new track's port.
     */
    public addNewTrack(name: string, port = 0) {
        if (this.tracks.length > 1) {
            this.format = 1;
        }
        const track = new MIDITrack();
        track.name = name;
        track.port = port;
        this.tracks.push(track);
        this.addEvent(
            0,
            this.tracks.length - 1,
            midiMessageTypes.trackName,
            this.encoder.encode(name)
        );
        this.addEvent(0, this.tracks.length - 1, midiMessageTypes.midiPort, [
            port
        ]);
    }

    /**
     * Adds a new MIDI Event.
     * @param ticks the tick time of the event (absolute).
     * @param track the track number to use.
     * @param event the MIDI event number.
     * @param eventData {Uint8Array|Iterable<number>} the raw event data.
     */
    public addEvent(
        ticks: number,
        track: number,
        event: MIDIMessageType,
        eventData: Uint8Array | Iterable<number>
    ) {
        if (!this.tracks[track]) {
            throw new Error(
                `Track ${track} does not exist. Add it via addTrack method.`
            );
        }
        this.tracks[track].pushEvent(
            new MIDIMessage(ticks, event, new IndexedByteArray(eventData))
        );
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Adds a new Note On event.
     * @param ticks the tick time of the event.
     * @param track the track number to use.
     * @param channel the channel to use.
     * @param midiNote the midi note of the keypress.
     * @param velocity the velocity of the keypress.
     */
    public addNoteOn(
        ticks: number,
        track: number,
        channel: number,
        midiNote: number,
        velocity: number
    ) {
        channel %= 16;
        midiNote %= 128;
        velocity %= 128;
        this.addEvent(
            ticks,
            track,
            (midiMessageTypes.noteOn | channel) as MIDIMessageType,
            [midiNote, velocity]
        );
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Adds a new Note Off event.
     * @param ticks the tick time of the event.
     * @param track the track number to use.
     * @param channel the channel to use.
     * @param midiNote the midi note of the key release.
     * @param velocity optional and unsupported by spessasynth.
     */
    public addNoteOff(
        ticks: number,
        track: number,
        channel: number,
        midiNote: number,
        velocity = 64
    ) {
        channel %= 16;
        midiNote %= 128;
        this.addEvent(
            ticks,
            track,
            (midiMessageTypes.noteOff | channel) as MIDIMessageType,
            [midiNote, velocity]
        );
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Adds a new Program Change event.
     * @param ticks the tick time of the event.
     * @param track the track number to use.
     * @param channel the channel to use.
     * @param programNumber the MIDI program to use.
     */
    public addProgramChange(
        ticks: number,
        track: number,
        channel: number,
        programNumber: number
    ) {
        channel %= 16;
        programNumber %= 128;
        this.addEvent(
            ticks,
            track,
            (midiMessageTypes.programChange | channel) as MIDIMessageType,
            [programNumber]
        );
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Adds a new Controller Change event.
     * @param ticks the tick time of the event.
     * @param track the track number to use.
     * @param channel the channel to use.
     * @param controllerNumber the MIDI CC to use.
     * @param controllerValue the new CC value.
     */
    public addControllerChange(
        ticks: number,
        track: number,
        channel: number,
        controllerNumber: number,
        controllerValue: number
    ) {
        channel %= 16;
        controllerNumber %= 128;
        controllerValue %= 128;
        this.addEvent(
            ticks,
            track,
            (midiMessageTypes.controllerChange | channel) as MIDIMessageType,
            [controllerNumber, controllerValue]
        );
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Adds a new Pitch Wheel event.
     * @param ticks the tick time of the event.
     * @param track the track to use.
     * @param channel the channel to use.
     * @param MSB SECOND byte of the MIDI pitchWheel message.
     * @param LSB FIRST byte of the MIDI pitchWheel message.
     */
    public addPitchWheel(
        ticks: number,
        track: number,
        channel: number,
        MSB: number,
        LSB: number
    ) {
        channel %= 16;
        MSB %= 128;
        LSB %= 128;
        this.addEvent(
            ticks,
            track,
            (midiMessageTypes.pitchWheel | channel) as MIDIMessageType,
            [LSB, MSB]
        );
    }
}
