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
     * MIDI ticks of the change, absolute value from the start of the MIDI file.
     */
    ticks: number;
    /**
     * New tempo in BPM.
     */
    tempo: number;
}

export type MIDILoopType = "soft" | "hard";

export interface MIDILoop {
    /**
     * Start of the loop, in MIDI ticks.
     */
    start: number;
    /**
     * End of the loop, in MIDI ticks.
     */
    end: number;

    /**
     * The type of the loop detected:
     * - Soft - the playback will immediately jump to the loop start pointer without any further processing.
     * - Hard - the playback will quickly process all messages from
     * the start of the file to ensure that synthesizer is in the correct state.
     * This is the default behavior.
     *
     * Soft loop types are enabled for Touhou and GameMaker loop points.
     */
    type: MIDILoopType;
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

export interface TimelineEvent {
    /**
     * The track number of this event.
     */
    tr: number;
    /**
     * The index of this event within the track.
     */
    ev: number;
}
export type SysExAcceptedArray =
    | number[]
    | Uint8Array
    | Int8Array
    | Uint16Array
    | Int16Array
    | Uint32Array
    | Int32Array
    | Uint8ClampedArray
    | Float32Array
    | Float64Array;
