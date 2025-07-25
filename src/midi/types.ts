/**
 * RMIDMetadata type represents metadata for an RMIDI file.
 */
export type RMIDMetadata = {
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
};

export type TempoChange = {
    // MIDI ticks of the change.
    ticks: number;
    // new tempo in BPM.
    tempo: number;
};
export type MIDILoop = {
    // start of the loop, in MIDI ticks.
    start: number;
    // end of the loop, in MIDI ticks.
    end: number;
};

export type MIDIFormat = 0 | 1 | 2;

export type NoteTime = {
    // the MIDI key number.
    midiNote: number;
    // start of the note, in seconds.
    start: number;
    // length of the note, in seconds.
    length: number;
    // the MIDI velocity of the note.
    velocity: number;
};

/**
 * Represents a desired program change for a MIDI channel.
 */
export type DesiredProgramChange = {
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
};

/**
 * Represents a desired controller change for a MIDI channel.
 */
export type DesiredControllerChange = {
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
};

/**
 * Represents a desired channel transpose change.
 */
export type DesiredChannelTranspose = {
    /**
     * The channel number.
     */
    channel: number;

    /**
     * The number of semitones to transpose.
     * This can use floating point numbers, which will be used to fine-tune the pitch in cents using RPN.
     */
    keyShift: number;
};
