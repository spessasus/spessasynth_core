import type { BasicSoundBank } from "../soundbank/basic_soundbank/basic_soundbank";
import type {
    MIDIPatch,
    MIDIPatchFull
} from "../soundbank/basic_soundbank/midi_patch";
import type { MIDISystem } from "../soundbank/types";

export type {
    ChannelDrumModification,
    ChannelModification,
    ClearableParameter,
    UserDrumModification
} from "./midi_tools/midi_editor/types";

/**
 * RMIDInfoData type represents metadata for an RMIDI file.
 *
 * @group MIDI.Sequence
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
     * The attached picture, usually album cover. Binary data of the image.
     */
    picture: ArrayBuffer;

    /**
     * The comment of the file.
     */
    comment: string;

    /**
     * The creation date of the file. If not provided, current date is used.
     */
    creationDate: Date;

    /**
     * The copyright string.
     * If not provided, `Created using SpessaSynth` is used.
     */
    copyright: string;

    /**
     * The encoding of the RMIDI info.
     */
    infoEncoding: string;

    /**
     * The encoding of the inner MIDI file.
     * Make sure to pick a value acceptable by `TextDecoder`.
     */
    midiEncoding: string;

    /**
     * The software used to write the file.
     * If not provided, `SpessaSynth` is used.
     */
    software: string;

    /**
     * The subject of the file.
     */
    subject: string;
}

/**
 * A single tempo change in a MIDI sequence.
 *
 * @group MIDI.Sequence
 */
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

/**
 * Represents a loop in a {@link BasicMIDI} sequence.
 *
 * @group MIDI.Sequence
 */
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
     * Soft loop types are enabled for Touhou loop points (CC 2 and CC 4) and RPG Maker loop points (CC 111).
     */
    type: "soft" | "hard";
}

/**
 *
 * The MIDI file track format.
 * Format 0 allows only one track while format 1 allows more than one.
 * Format 2 is very rare and should not be used.
 *
 * @group MIDI.Sequence
 */
export type MIDIFormat = 0 | 1 | 2;

/**
 * A single note's time and velocity, as returned by {@link BasicMIDI.getNoteTimes}.
 *
 * @group MIDI.Sequence
 */
export interface NoteTime {
    /**
     * The MIDI note number.
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
 * Options for writing an RMIDI file.
 *
 * @group MIDI.Files
 */
export interface RMIDIWriteOptions {
    /**
     * The bank offset to apply to the file, an integer from 0 to 127. Defaults to `0`.
     * [See this for more info](https://github.com/spessasus/sf2-rmidi-specification#dbnk-chunk)
     */
    bankOffset: number;
    /**
     * The metadata of the file. If left undefined, some basic metadata (like the song's title) will be copied from the MIDI.
     * All properties are optional.
     *
     * > **Warning**
     * >
     * > Writing always sets the info encoding to `utf-8`,
     * > since the default fields (such as the creation date) are always written.
     * > This behavior is forced due to lack of support for other encodings by the `TextEncoder` class.
     * > Existing info chunks in another encoding (see {@link BasicMIDI.infoEncoding}) are re-encoded to UTF-8.
     *
     */
    metadata: Partial<Omit<RMIDInfoData, "infoEncoding">>;
    /**
     * If the function should correct all program-selects and bank-selects in the MIDI file to reflect the embedded sound bank (i.e., make it [self-contained](https://github.com/spessasus/sf2-rmidi-specification#self-contained-file)).
     * Recommended unless a specific use-case is required. Defaults to `true`.
     */
    correctBankOffset: boolean;

    /**
     * The sound bank instance that `soundBankBinary` contains.
     * Used for correcting bank and program changes when `correctBankOffset` is enabled.
     * If it is omitted, the correction is skipped and a warning is logged.
     */
    soundBank?: BasicSoundBank;
}

/**
 * RIFF Four Character Codes found in the RMIDI INFO chunk.
 *
 * @group Utilities.FourCC
 */
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

/**
 * A reference to an event in {@link BasicMIDI.timeline}, pointing at its track and its index in that track.
 *
 * @group MIDI.Sequence
 */
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
/**
 * An array-like type that can hold System Exclusive message data.
 *
 * @group MIDI.Protocol
 */
export type SysExAcceptedArray =
    number[] | Uint8Array | Int8Array | Uint8ClampedArray;

/**
 * Options for encoding an analyzed message with {@link MIDIUtils.fromAnalyzedMessage}.
 *
 * @group MIDI.Protocol
 */
export interface MIDIEncodeOptions {
    /**
     * The preferred system to write a System Exclusive message for, when it exists in more than one system
     * (global and channel MIDI parameters and drum map setups).
     *
     * A message that the system does not have uses the one it has, GS first for `gm` and `gm2`
     * (like the dry level, which is always XG, or a channel parameter for `gm`, which is GS).
     *
     * A message named after GS or XG always uses that system,
     * except the GS reverb and chorus parameters that GM2 also has (the macros GM2 does not have stay GS),
     * which use the Universal message for `gm` and `gm2`.
     *
     * Messages with a standard channel message form (controllers, programs, RPNs and so on) ignore it.
     */
    preferredSystem: MIDISystem;
    /**
     * The device ID byte of System Exclusive messages. Leave it undefined for the default:
     * 16 (`0x10`) for Roland and Yamaha, 127 (`0x7F`, broadcast) for Universal messages.
     * For Yamaha, the high nibble is the message type, so keep it at 1 (`0x1n`, parameter change).
     * It is written into whichever message the preferred system picks, so keep it undefined when that can be a Universal one
     * (the XG master pan, the GM2 reverb and chorus).
     *
     * It is very rare that you need to change this.
     */
    deviceID: number | undefined;
    /**
     * The MIDI tick time of the returned messages.
     */
    ticks: number;
    /**
     * The drum pitch coarse resolution in semitones, for the drum NRPNs (`Channel Drum Setup` pitch coarse).
     * 0.5 for GS (SC-88 and above), 1 for XG and the SC-55 drum map (bank LSB 1).
     * The GS `Map Drum Setup` message always uses 0.5, like the analysis assumes.
     */
    drumPitchStep: number;
}

/**
 * An interface that represents a virtual sound bank which can return a preset.
 *
 * @group Sound Banks
 */
export interface CallableSoundBank<T extends MIDIPatchFull> {
    /**
     * Returns the matching {@link BasicPreset} instance.
     * This uses the {@link MIDIPatchTools.selectPatch} algorithm for selecting the optimal preset.
     * @param patch The patch to select.
     * @param system The MIDI system to select for.
     * @returns The selected preset.
     */
    getPreset(patch: MIDIPatch, system: MIDISystem): T | undefined;
}
/**
 * Represents a single drum instrument's XG/GS parameters.
 *
 * @group Synthesizer.Drum Sets
 */
export interface DrumParameter {
    /**
     * Pitch offset in semitones. Relative value.
     * May be floating point! (GS half-semitone coarse tune resolution)
     */
    pitchCoarse: number;

    /**
     * Pitch offset in cents. Relative value.
     */
    pitchFine: number;

    /**
     * Level in 0 - 127 range.
     */
    level: number;

    /**
     * Exclusive class override.
     */
    assignGroup: number;

    /**
     * Pan, 1-64-127, 0 is random. This adds to the channel pan!
     */
    pan: number;

    /**
     * Reverb send level 0-127.
     */
    reverbSend: number;

    /**
     * Chorus send level 0-127.
     */
    chorusSend: number;

    /**
     * Variation/delay send level 0-127.
     */
    variationSend: number;

    /**
     * If note on should be received.
     */
    rxNoteOn: boolean;

    /**
     * If note off should be received.
     * Note:
     * Due to the way sound banks implement drums (as 100s release time),
     * this means killing the voice on note off, not releasing it.
     */
    rxNoteOff: boolean;
}

/**
 * Represents a single User Drum Set parameter.
 *
 * > **Tip**
 * >
 * > Consider reading the [MIDI Implementation of the User Drum Set.](../../docs/extra/midi-implementation.md#user-drum-set)
 *
 * @group Synthesizer.Drum Sets
 */
export interface UserDrumSetParameter extends DrumParameter {
    /**
     * Pitch offset in GS steps (the PLAY NOTE NUMBER relative to 60). Relative value.
     * A step is 50 cents, or 100 cents when `sourceDrumSet` is 1 (SC-55 map).
     * The conversion to semitones happens when the drum set is selected.
     */
    pitchCoarse: number;
    /**
     * The source drum set bank LSB number.
     */
    sourceDrumSet: number;
    /**
     * The MIDI program number of the source drum set.
     */
    program: number;
    /**
     * The MIDI key number from the source drum set to bind.
     */
    sourceNoteNumber: number;
}
