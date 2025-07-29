import { IndexedByteArray } from "../utils/indexed_array";
import type { RMIDINFOChunk } from "./enums";
import type { MIDIFormat, MIDILoop, TempoChange } from "./types";

import type { KeyRange } from "../soundbank/types";

/**
 * This is the base type for MIDI files. It contains all the "metadata" and information.
 * It extends to:
 * - BasicMIDI, which contains the actual track data of the MIDI file. Essentially the MIDI file itself.
 * - MIDIData, which contains all properties that MIDI does, except for tracks and the embedded soundfont.
 * MIDIData is the "shell" of the file which is available on the main thread at all times, containing the metadata.
 */
class MIDISequenceData {
    /**
     * The time division of the sequence, representing the number of ticks per beat.
     */
    public timeDivision = 0;

    /**
     * The duration of the sequence, in seconds.
     */
    public duration = 0;

    /**
     * The tempo changes in the sequence, ordered from the last change to the first.
     * Each change is represented by an object with a tick position and a tempo value in beats per minute.
     */
    public tempoChanges: TempoChange[] = [{ ticks: 0, tempo: 120 }];

    /**
     * A string containing the copyright information for the MIDI sequence if detected.
     */
    public copyright = "";

    /**
     * The number of tracks in the MIDI sequence.
     */
    public tracksAmount = 0;

    /**
     * The track names in the MIDI file, an empty string if not set.
     */
    public trackNames: string[] = [];

    /**
     * An array containing the lyrics of the sequence, stored as binary chunks (Uint8Array).
     */
    public lyrics: Uint8Array[] = [];

    /**
     * An array of tick positions where lyrics events occur in the sequence.
     */
    public lyricsTicks: number[] = [];

    /**
     * The tick position of the first note-on event in the MIDI sequence.
     */
    public firstNoteOn = 0;

    /**
     * The MIDI key range used in the sequence, represented by a minimum and maximum note value.
     */
    public keyRange: KeyRange = { min: 0, max: 127 };

    /**
     * The tick position of the last voice event (such as note-on, note-off, or control change) in the sequence.
     */
    public lastVoiceEventTick = 0;

    /**
     * An array of MIDI port numbers used by each track in the sequence.
     */
    public midiPorts: number[] = [0];

    /**
     * An array of channel offsets for each MIDI port, using the SpessaSynth method.
     */
    public midiPortChannelOffsets: number[] = [0];

    /**
     * A list of sets, where each set contains the MIDI channels used by each track in the sequence.
     */
    public usedChannelsOnTrack: Set<number>[] = [];

    /**
     * The loop points (in ticks) of the sequence, including both start and end points.
     */
    public loop: MIDILoop = { start: 0, end: 0 };

    /**
     * The name of the MIDI sequence.
     */
    public midiName = "";

    /**
     * A boolean indicating if the sequence's name is the same as the file name.
     */
    public midiNameUsesFileName = false;

    /**
     * The file name of the MIDI sequence, if provided during parsing.
     */
    public fileName = "";

    /**
     * The raw, encoded MIDI name, represented as a Uint8Array.
     * Useful when the MIDI file uses a different code page.
     */
    public rawMidiName: Uint8Array = new Uint8Array(0);

    /**
     * The format of the MIDI file, which can be 0, 1, or 2, indicating the type of the MIDI file.
     */
    public format: MIDIFormat = 0;

    /**
     * The RMID (Resource-Interchangeable MIDI) info data, if the file is RMID formatted.
     * Otherwise, this field is undefined.
     * Chunk type (e.g. "INAM"): Chunk data as a binary array.
     */
    public rmidiInfo: Partial<Record<RMIDINFOChunk, IndexedByteArray>> = {};

    /**
     * The bank offset used for RMID files.
     */
    public bankOffset = 0;

    /**
     * If the MIDI file is a Soft Karaoke file (.kar), this flag is set to true.
     * https://www.mixagesoftware.com/en/midikit/help/HTML/karaoke_formats.html
     */
    public isKaraokeFile = false;

    /**
     * Indicates if this file is a Multi-Port MIDI file.
     */
    public isMultiPort = false;

    /**
     * Converts ticks to time in seconds
     * @param ticks time in MIDI ticks
     * @returns time in seconds
     */
    public midiTicksToSeconds(ticks: number): number {
        let totalSeconds = 0;

        while (ticks > 0) {
            // tempo changes are reversed, so the first element is the last tempo change
            // and the last element is the first tempo change
            // (always at tick 0 and tempo 120)
            // find the last tempo change that has occurred
            const tempo = this.tempoChanges.find((v) => v.ticks < ticks);
            if (!tempo) {
                return totalSeconds;
            }

            // calculate the difference and tempo time
            const timeSinceLastTempo = ticks - tempo.ticks;
            totalSeconds +=
                (timeSinceLastTempo * 60) / (tempo.tempo * this.timeDivision);
            ticks -= timeSinceLastTempo;
        }

        return totalSeconds;
    }

    /**
     * INTERNAL USE ONLY!
     */
    protected _copyFromSequence(sequence: MIDISequenceData) {
        // properties can be assigned
        this.midiName = sequence.midiName;
        this.midiNameUsesFileName = sequence.midiNameUsesFileName;
        this.fileName = sequence.fileName;
        this.timeDivision = sequence.timeDivision;
        this.duration = sequence.duration;
        this.copyright = sequence.copyright;
        this.tracksAmount = sequence.tracksAmount;
        this.firstNoteOn = sequence.firstNoteOn;
        this.lastVoiceEventTick = sequence.lastVoiceEventTick;
        this.format = sequence.format;
        this.bankOffset = sequence.bankOffset;
        this.isKaraokeFile = sequence.isKaraokeFile;
        this.isMultiPort = sequence.isMultiPort;

        // copying arrays
        this.tempoChanges = [...sequence.tempoChanges];
        this.lyrics = sequence.lyrics.map((arr) => new Uint8Array(arr));
        this.lyricsTicks = [...sequence.lyricsTicks];
        this.midiPorts = [...sequence.midiPorts];
        this.trackNames = [...sequence.trackNames];
        this.midiPortChannelOffsets = [...sequence.midiPortChannelOffsets];
        this.usedChannelsOnTrack = sequence.usedChannelsOnTrack.map(
            (set) => new Set(set)
        );
        this.rawMidiName = sequence.rawMidiName
            ? new Uint8Array(sequence.rawMidiName)
            : new Uint8Array(0);

        // copying objects
        this.loop = { ...sequence.loop };
        this.keyRange = { ...sequence.keyRange };
        this.rmidiInfo = {};
        for (const [key, value] of Object.entries(sequence.rmidiInfo)) {
            this.rmidiInfo[key as RMIDINFOChunk] = new IndexedByteArray(value);
        }
    }
}

export { MIDISequenceData };
