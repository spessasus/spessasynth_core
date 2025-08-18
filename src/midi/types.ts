import type { BasicSoundBank } from "../soundbank/basic_soundbank/basic_soundbank";

/**
 * RMIDInfoData type represents metadata for an RMIDI file.
 */
export interface RMIDInfoData {
    /**
     * The name of the song.
     */
    name: string;

    /**
     * The engineer who worked on the sound bank file.
     */
    engineer: string;

    /**
     * The artist of the MIDI file.
     */
    artist: string;

    /**
     * The album of the song.
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
    creationDate: Date;

    /**
     * The copyright of the file.
     */
    copyright: string;

    /**
     * The encoding of the RMIDI info.
     */
    infoEncoding: string;

    /**
     * The encoding of the MIDI file's text messages.
     */
    midiEncoding: string;

    /**
     * The software used to write the file.
     */
    software: string;

    /**
     * The subject of the file.
     */
    subject: string;
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
     * The metadata of the file. Optional.
     */
    metadata: Partial<Omit<RMIDInfoData, "infoEncoding">>;
    /**
     * If the MIDI file should internally be corrected to work with the set bank offset.
     */
    correctBankOffset: boolean;

    /**
     * The optional sound bank instance used to correct bank offset.
     */
    soundBank?: BasicSoundBank;
}
export type RMIDInfoFourCC =
    // Name
    | "INAM"
    // Album
    | "IPRD"
    // Album two
    | "IALB"
    // Artist
    | "IART"
    // Genre
    | "IGNR"
    // Picture
    | "IPIC"
    // Copyright
    | "ICOP"
    // Creation date
    | "ICRD"
    // Creation date (old spessasynth)
    | "ICRT"
    // Comment
    | "ICMT"
    // Engineer
    | "IENG"
    // Software
    | "ISFT"
    // Subject
    | "ISBJ"
    // Info encoding
    | "IENC"
    // MIDI encoding
    | "MENC"
    // Bank offset
    | "DBNK";
