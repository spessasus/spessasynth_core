import type { BasicSoundBank } from "../soundbank/basic_soundbank/basic_soundbank";

/**
 * RMIDMetadata type represents metadata for an RMIDI file.
 */
export interface RMIDMetadata {
    /**
     * The name of the file.
     */
    name: string;

    /**
     * The engineer who worked on the file.
     */
    engineer: string;

    /**
     * The artist.
     */
    artist: string;

    /**
     * The album.
     */
    album: string;

    /**
     * The genre of the song.
     */
    genre: string;

    /**
     * The image for the file (album cover).
     */
    picture: ArrayBuffer;

    /**
     * The comment of the file.
     */
    comment: string;

    /**
     * The creation date of the file.
     */
    creationDate: string;

    /**
     * The copyright of the file.
     */
    copyright: string;

    /**
     * The encoding of the inner MIDI file.
     */
    midiEncoding: string;
}

export interface TempoChange {
    /**
     * MIDI ticks of the change.
     */
    ticks: number;
    /**
     * New tempo in BPM.
     */
    tempo: number;
}

export interface MIDILoop {
    /**
     * Start of the loop, in MIDI ticks.
     */
    start: number;
    /**
     * End of the loop, in MIDI ticks.
     */
    end: number;
}

export type MIDIFormat = 0 | 1 | 2;

export interface NoteTime {
    /**
     * The MIDI key number.
     */
    midiNote: number;
    /**
     * Start of the note, in seconds.
     */
    start: number;
    /**
     * Length of the note, in seconds.
     */
    length: number;
    /**
     * The MIDI velocity of the note.
     */
    velocity: number;
}

/**
 * Represents a desired program change for a MIDI channel.
 */
export interface DesiredProgramChange {
    /**
     * The channel number.
     */
    channel: number;

    /**
     * The program number.
     */
    program: number;

    /**
     * The bank number.
     */
    bank: number;

    /**
     * Indicates if the channel is a drum channel.
     * If it is, then the bank number is ignored.
     */
    isDrum: boolean;
}

/**
 * Represents a desired controller change for a MIDI channel.
 */
export interface DesiredControllerChange {
    /**
     * The channel number.
     */
    channel: number;

    /**
     * The MIDI controller number.
     */
    controllerNumber: number;

    /**
     * The new controller value.
     */
    controllerValue: number;
}

/**
 * Represents a desired channel transpose change.
 */
export interface DesiredChannelTranspose {
    /**
     * The channel number.
     */
    channel: number;

    /**
     * The number of semitones to transpose.
     * This can use floating point numbers, which will be used to fine-tune the pitch in cents using RPN.
     */
    keyShift: number;
}

export interface RMIDIWriteOptions {
    /**
     * The bank offset for RMIDI.
     */
    bankOffset: number;
    /**
     * The encoding of the RMIDI info chunk.
     */
    encoding: string;
    /**
     * The metadata of the file. Optional. If provided, the encoding is forced to utf-8.
     */
    metadata: Partial<RMIDMetadata>;
    /**
     * If the MIDI file should internally be corrected to work with the set bank offset.
     */
    correctBankOffset: boolean;

    /**
     * The optional sound bank instance used to correct bank offset.
     */
    soundBank?: BasicSoundBank;
}
