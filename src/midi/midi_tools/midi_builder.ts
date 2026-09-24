import { BasicMIDI } from "../basic_midi";
import { MIDIMessage } from "../midi_message";
import { IndexedByteArray } from "../../utils/indexed_array";
import {
    type MIDIController,
    MIDIControllers,
    type MIDIMessageType,
    MIDIMessageTypes
} from "../enums";
import { MIDITrack } from "../midi_track";
import type { MIDIFormat, SysExAcceptedArray } from "../types";
import { fillWithDefaults } from "../../utils/fill_with_defaults";

/**
 * Options for initializing the MIDI Builder.
 *
 * @group MIDI.Files
 */
export interface MIDIBuilderOptions {
    /**
     * The MIDI file's tick precision (how many ticks fit in a quarter note).
     * Defaults to 480.
     * See {@BasicMIDI.timeDivision}
     */
    timeDivision: number;
    /**
     * The MIDI file's initial tempo in BPM.
     * Defaults to 120.
     */
    initialTempo: number;

    /**
     * The MIDI file track format.
     * Format 0 allows only one track while format 1 allows more than one.
     * Format 2 is very rare and should not be used.
     */
    format: MIDIFormat;

    /**
     * The MIDI file's name. Will be appended to the conductor (first) track and encoded with UTF-8.
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
 * SpessaSynth allows you to create MIDI files from scratch.
 *
 * `MIDIBuilder` is a class designed to create those files with an easy-to-use API.
 *
 * This class inherits from {@link BasicMIDI} which means it can simply be used with {@link BasicMIDI.writeMIDI}
 * or passed to {@link SpessaSynthSequencer} for playback.
 *
 * > **Danger**
 * >
 * > Remember to call {@link BasicMIDI.flush} after you're done building the file!
 *
 * @group MIDI.Files
 */
export class MIDIBuilder extends BasicMIDI {
    private encoder = new TextEncoder();

    /**
     * Creates a new MIDI file.
     * The file is initialized with one track.
     * @param options Optional options for initializing the MIDI sequence.
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
     * @param ticks The MIDI tick time of this event.
     * @param tempo The tempo in beats per minute (BPM).
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
     * @param name The new track's name, will be encoded with UTF-8.
     * @param port The new track's port number. Use 0 if you are not creating a multi-port MIDI file.
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
     * @param ticks The MIDI tick time of this event.
     * @param track The MIDI track number to put this event on.
     * @param statusByte The MIDI status byte.
     * @param eventData The 7-bit MIDI event data.
     */
    public addEvent(
        ticks: number,
        track: number,
        statusByte: MIDIMessageType,
        eventData: ArrayLike<number>
    ) {
        if (!this.tracks[track]) {
            throw new Error(
                `Track ${track} does not exist. Add it via addTrack method.`
            );
        }
        if (
            statusByte >= MIDIMessageTypes.noteOff && // Voice event
            this.format === 1 &&
            track === 0
        ) {
            throw new Error(
                "Can't add voice messages to the conductor track (0) in format 1. Consider using format 0 using a different track."
            );
        }
        this.tracks[track].pushEvents(
            new MIDIMessage(ticks, statusByte, new IndexedByteArray(eventData))
        );
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Adds a new Note On event.
     * @param ticks The MIDI tick time of this event.
     * @param track The MIDI track number to put this event on.
     * @param channel The channel to use (0-16).
     * @param midiNote The MIDI note number (0-127).
     * @param velocity The velocity of the note (0-127). THe higher, the louder the note is. Velocity of 0 is interpreted as note-off.
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
     * @param ticks The MIDI tick time of this event.
     * @param track The MIDI track number to put this event on.
     * @param channel The channel to use (0-16).
     * @param midiNote The MIDI note number (0-127).
     * @param velocity The optional velocity of the release.
     * This parameter is not recognized by {@link SpessaSynthProcessor} and can safely be left at default.
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
     * @param ticks The MIDI tick time of this event.
     * @param track The MIDI track number to put this event on.
     * @param channel The channel to use (0-16).
     * @param programNumber The MIDI program number to use (0-127).
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
     * @param ticks The MIDI tick time of this event.
     * @param track The MIDI track number to put this event on.
     * @param channel The channel to use (0-16).
     * @param controller The MIDI controller number to use (0-127).
     * @param value The new MIDI controller value (0-127).
     */
    public controllerChange(
        ticks: number,
        track: number,
        channel: number,
        controller: MIDIController,
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

    /**
     * Adds a new Pitch Wheel event.
     * @param ticks The MIDI tick time of this event.
     * @param track The MIDI track number to put this event on.
     * @param channel The channel to use (0-16).
     * @param pitch The new 14-bit value (0-16,383), where 8192 is the center (no pitch change).
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

    /**
     * Adds a new Poly Pressure event.
     * @param ticks The MIDI tick time of this event.
     * @param track The MIDI track number to put this event on.
     * @param channel The channel to use (0-16).
     * @param midiNote The MIDI note number to apply the pressure to (0-127).
     * @param pressure The pressure value (0-127).
     */
    public polyPressure(
        ticks: number,
        track: number,
        channel: number,
        midiNote: number,
        pressure: number
    ) {
        channel %= 16;
        this.addEvent(
            ticks,
            track,
            (MIDIMessageTypes.polyPressure | channel) as MIDIMessageType,
            [midiNote & 0x7f, pressure & 0x7f]
        );
    }

    /**
     * Adds a new Channel Pressure event.
     * @param ticks The MIDI tick time of this event.
     * @param track The MIDI track number to put this event on.
     * @param channel The channel to use (0-16).
     * @param pressure The pressure value (0-127)
     */
    public channelPressure(
        ticks: number,
        track: number,
        channel: number,
        pressure: number
    ) {
        channel %= 16;
        this.addEvent(
            ticks,
            track,
            (MIDIMessageTypes.channelPressure | channel) as MIDIMessageType,
            [pressure & 0x7f]
        );
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Adds a new System Exclusive.
     * @param ticks The MIDI tick time of this event.
     * @param track The MIDI track number to put this event on.
     * @param data The 7-bit System Exclusive data, without the `0xF0` status byte.
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
     * @param ticks The MIDI tick time of the events.
     * @param track The MIDI track number to put these events on.
     * @param channel The channel to use (0-16).
     * @param parameter The 14-bit registered parameter number. For example 0 is pitch wheel range.
     * @param value The 14-bit value for this parameter.
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
     * @param ticks The MIDI tick time of the events.
     * @param track The MIDI track number to put these events on.
     * @param channel The channel to use (0-16).
     * @param parameter The 14-bit non-registered parameter number.
     * @param value The 14-bit value for this parameter.
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
