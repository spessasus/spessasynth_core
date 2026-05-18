import { BasicMIDI } from "../basic_midi";
import { MIDIMessage } from "../midi_message";
import { IndexedByteArray } from "../../utils/indexed_array";
import {
    MIDIControllers,
    type MIDIMessageType,
    MIDIMessageTypes
} from "../enums";
import { MIDITrack } from "../midi_track";
import type { MIDIFormat, SysExAcceptedArray } from "../types";
import { fillWithDefaults } from "../../utils/fill_with_defaults";

interface MIDIBuilderOptions {
    /**
     * The MIDI file's tick precision (how many ticks fit in a quarter note).
     */
    timeDivision: number;
    /**
     * The MIDI file's initial tempo in BPM.
     */
    initialTempo: number;

    /**
     * The MIDI file's MIDI track format.
     */
    format: MIDIFormat;

    /**
     * The MIDI file's name. Will be appended to the conductor track.
     */
    name: string;
}

const DEFAULT_MIDI_BUILDER_OPTIONS: MIDIBuilderOptions = {
    name: "Untitled song",
    timeDivision: 480,
    initialTempo: 120,
    format: 0
};

/**
 * A class that helps to build a MIDI file from scratch.
 */
export class MIDIBuilder extends BasicMIDI {
    private encoder = new TextEncoder();

    /**
     * Creates a new MIDI file.
     * @param options The options for writing the file.
     */
    public constructor(
        options: Partial<MIDIBuilderOptions> = DEFAULT_MIDI_BUILDER_OPTIONS
    ) {
        super();
        this.setRMIDInfo("midiEncoding", "utf-8");
        const fullOptions = fillWithDefaults(
            options,
            DEFAULT_MIDI_BUILDER_OPTIONS
        );
        if (fullOptions.format === 2) {
            throw new Error(
                "MIDI format 2 is not supported in the MIDI builder. Consider using format 1."
            );
        }
        this.format = fullOptions.format;
        this.timeDivision = fullOptions.timeDivision;
        this.binaryName = this.encoder.encode(fullOptions.name);

        // Create the first (conductor) track with the file name
        this.addTrack(fullOptions.name);
        this.setTempo(0, fullOptions.initialTempo);
    }

    /**
     * Adds a new Set Tempo event.
     * @param ticks the tick number of the event.
     * @param tempo the tempo in beats per minute (BPM).
     */
    public setTempo(ticks: number, tempo: number) {
        const array = new IndexedByteArray(3);

        tempo = 60_000_000 / tempo;

        // Extract each byte in big-endian order
        array[0] = (tempo >> 16) & 0xff;
        array[1] = (tempo >> 8) & 0xff;
        array[2] = tempo & 0xff;

        this.addEvent(ticks, 0, MIDIMessageTypes.setTempo, array);
    }

    /**
     * Adds a new MIDI track.
     * @param name the new track's name.
     * @param port the new track's port.
     */
    public addTrack(name: string, port = 0) {
        if (this.format === 0 && this.tracks.length > 0) {
            throw new Error(
                "Can't add more tracks to MIDI format 0. Consider using format 1."
            );
        }
        const track = new MIDITrack();
        track.name = name;
        track.port = port;
        this.tracks.push(track);
        this.addEvent(
            0,
            this.tracks.length - 1,
            MIDIMessageTypes.trackName,
            this.encoder.encode(name)
        );
        this.addEvent(0, this.tracks.length - 1, MIDIMessageTypes.midiPort, [
            port
        ]);
    }

    /**
     * Adds a new MIDI Event.
     * @param ticks the tick time of the event (absolute).
     * @param track the track number to use.
     * @param event the MIDI event number.
     * @param eventData the raw event data.
     */
    public addEvent(
        ticks: number,
        track: number,
        event: MIDIMessageType,
        eventData: ArrayLike<number>
    ) {
        if (!this.tracks[track]) {
            throw new Error(
                `Track ${track} does not exist. Add it via addTrack method.`
            );
        }
        if (
            event >= MIDIMessageTypes.noteOff && // Voice event
            this.format === 1 &&
            track === 0
        ) {
            throw new Error(
                "Can't add voice messages to the conductor track (0) in format 1. Consider using format 0 using a different track."
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
    public noteOn(
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
            (MIDIMessageTypes.noteOn | channel) as MIDIMessageType,
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
    public noteOff(
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
            (MIDIMessageTypes.noteOff | channel) as MIDIMessageType,
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
    public programChange(
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
            (MIDIMessageTypes.programChange | channel) as MIDIMessageType,
            [programNumber]
        );
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Adds a new Controller Change event.
     * @param ticks the tick time of the event.
     * @param track the track number to use.
     * @param channel the channel to use.
     * @param controller the MIDI CC to use.
     * @param value the new CC value.
     */
    public controllerChange(
        ticks: number,
        track: number,
        channel: number,
        controller: number,
        value: number
    ) {
        channel %= 16;
        controller %= 128;
        value %= 128;
        this.addEvent(
            ticks,
            track,
            (MIDIMessageTypes.controllerChange | channel) as MIDIMessageType,
            [controller, value]
        );
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Adds a new Pitch Wheel event.
     * @param ticks the tick time of the event.
     * @param track the track to use.
     * @param channel the channel to use.
     * @param pitch the pitch (0 - 16383).
     */
    public pitchWheel(
        ticks: number,
        track: number,
        channel: number,
        pitch: number
    ) {
        channel %= 16;
        pitch %= 16_384;
        this.addEvent(
            ticks,
            track,
            (MIDIMessageTypes.pitchWheel | channel) as MIDIMessageType,
            [pitch & 0x7f, (pitch >> 7) & 0x7f]
        );
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Adds a new System Exclusive.
     * @param ticks the tick time of the event.
     * @param track the track to use.
     * @param data the System Exclusive data, without the 0xf0 status byte.
     */
    public systemExclusive(
        ticks: number,
        track: number,
        data: SysExAcceptedArray
    ) {
        this.addEvent(ticks, track, MIDIMessageTypes.systemExclusive, data);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Selects a new Registered Parameter Number.
     * @param ticks the tick time of the events.
     * @param track the track to use.
     * @param channel the channel to use.
     * @param parameter the 14-bit registered parameter number. For example 0 is pitch wheel range.
     * @param value the 14-bit value for this parameter.
     */
    public registeredParameter(
        ticks: number,
        track: number,
        channel: number,
        parameter: number,
        value: number
    ) {
        this.controllerChange(
            ticks,
            track,
            channel,
            MIDIControllers.registeredParameterMSB,
            parameter >> 7
        );
        this.controllerChange(
            ticks,
            track,
            channel,
            MIDIControllers.registeredParameterLSB,
            parameter & 0x7f
        );
        this.controllerChange(
            ticks,
            track,
            channel,
            MIDIControllers.dataEntryMSB,
            value >> 7
        );
        this.controllerChange(
            ticks,
            track,
            channel,
            MIDIControllers.dataEntryLSB,
            value & 0x7f
        );
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Selects a new Non-Registered Parameter Number.
     * @param ticks the tick time of the events.
     * @param track the track to use.
     * @param channel the channel to use.
     * @param parameter the 14-bit non-registered parameter number
     * @param value the 14-bit value for this parameter.
     */
    public nonRegisteredParameter(
        ticks: number,
        track: number,
        channel: number,
        parameter: number,
        value: number
    ) {
        this.controllerChange(
            ticks,
            track,
            channel,
            MIDIControllers.nonRegisteredParameterMSB,
            parameter >> 7
        );
        this.controllerChange(
            ticks,
            track,
            channel,
            MIDIControllers.nonRegisteredParameterLSB,
            parameter & 0x7f
        );
        this.controllerChange(
            ticks,
            track,
            channel,
            MIDIControllers.dataEntryMSB,
            value >> 7
        );
        this.controllerChange(
            ticks,
            track,
            channel,
            MIDIControllers.dataEntryLSB,
            value & 0x7f
        );
    }
}
