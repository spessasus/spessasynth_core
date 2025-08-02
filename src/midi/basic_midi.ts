import { getStringBytes, readBinaryString } from "../utils/byte_functions/string";
import { MIDIMessage } from "./midi_message";
import { readBigEndian } from "../utils/byte_functions/big_endian";
import { SpessaSynthGroup, SpessaSynthGroupEnd, SpessaSynthInfo } from "../utils/loggin";
import { consoleColors } from "../utils/other";
import { writeMIDIInternal } from "./midi_tools/midi_writer";
import { writeRMIDIInternal } from "./midi_tools/rmidi_writer";
import { getUsedProgramsAndKeys } from "./midi_tools/used_keys_loaded";
import { IndexedByteArray } from "../utils/indexed_array";
import { getNoteTimesInternal } from "./midi_tools/get_note_times";
import type { BasicSoundBank } from "../soundbank/basic_soundbank/basic_soundbank";
import type {
    DesiredChannelTranspose,
    DesiredControllerChange,
    DesiredProgramChange,
    MIDIFormat,
    MIDILoop,
    NoteTime,
    RMIDMetadata,
    TempoChange
} from "./types";
import { applySnapshotInternal, modifyMIDIInternal } from "./midi_tools/midi_editor";
import type { SynthesizerSnapshot } from "../synthesizer/audio_engine/snapshot/synthesizer_snapshot";
import { SoundBankManager } from "../synthesizer/audio_engine/engine_components/sound_bank_manager";
import { loadMIDIFromArrayBufferInternal } from "./midi_loader";
import { midiMessageTypes, type RMIDINFOChunk, rmidInfoChunks } from "./enums";
import type { KeyRange } from "../soundbank/types";
import { MIDITrack } from "./midi_track";

/**
 * BasicMIDI is the base of a complete MIDI file.
 */
export class BasicMIDI {
    /**
     * The track data of the MIDI file, represented as an array of tracks.
     */
    public tracks: MIDITrack[] = [];

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
     * Any extra metadata found in the file.
     */
    public extraMetadata: string[] = [];

    /**
     * An array containing the lyrics of the sequence, stored as binary chunks (Uint8Array).
     */
    public lyrics: MIDIMessage[] = [];

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
     * An array of channel offsets for each MIDI port, using the SpessaSynth method.
     */
    public portChannelOffsetMap: number[] = [0];

    /**
     * The loop points (in ticks) of the sequence, including both start and end points.
     */
    public loop: MIDILoop = { start: 0, end: 0 };

    /**
     * The name of the MIDI sequence.
     * It will be empty if no name is found.
     */
    public name = "";

    /**
     * The file name of the MIDI sequence, if provided during parsing.
     */
    public fileName = "";

    /**
     * The raw, encoded MIDI name, represented as a Uint8Array.
     * Useful when the MIDI file uses a different code page.
     * Undefined if no MIDI name could be found.
     */
    public rawName?: Uint8Array;

    /**
     * The format of the MIDI file, which can be 0, 1, or 2, indicating the type of the MIDI file.
     */
    public format: MIDIFormat = 0;

    /**
     * The RMID (Resource-Interchangeable MIDI) info data, if the file is RMID formatted.
     * Otherwise, this field is undefined.
     * Chunk type (e.g. "INAM"): Chunk data as a binary array.
     * Note that text chunks contain a terminal zero byte.
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
     * If the MIDI file is a DLS RMIDI file.
     */
    public isDLSRMIDI = false;
    /**
     * The embedded sound bank in the MIDI file, represented as an ArrayBuffer, if available.
     */
    public embeddedSoundBank?: ArrayBuffer;

    /**
     * Loads a MIDI file (SMF, RMIDI, XMF) from a given ArrayBuffer.
     * @param arrayBuffer The ArrayBuffer containing the binary file data.
     * @param fileName The optional name of the file, will be used if the MIDI file does not have a name.
     */
    public static fromArrayBuffer(
        arrayBuffer: ArrayBuffer,
        fileName = ""
    ): BasicMIDI {
        const mid = new BasicMIDI();
        loadMIDIFromArrayBufferInternal(mid, arrayBuffer, fileName);
        return mid;
    }

    /**
     * Copies a MIDI.
     * @param mid The MIDI to copy.
     * @returns The copied MIDI.
     */
    public static copyFrom(mid: BasicMIDI): BasicMIDI {
        const m = new BasicMIDI();
        m.copyMetadataFrom(mid);

        m.embeddedSoundBank = mid?.embeddedSoundBank?.slice(0) ?? undefined; // Deep copy
        m.tracks = mid.tracks.map((track) => MIDITrack.copyFrom(track)); // Deep copy of each track array
        return m;
    }

    /**
     * Converts ticks to time in seconds
     * @param ticks time in MIDI ticks
     * @returns time in seconds
     */
    public midiTicksToSeconds(ticks: number): number {
        let totalSeconds = 0;

        while (ticks > 0) {
            // Tempo changes are reversed, so the first element is the last tempo change
            // And the last element is the first tempo change
            // (always at tick 0 and tempo 120)
            // Find the last tempo change that has occurred
            const tempo = this.tempoChanges.find((v) => v.ticks < ticks);
            if (!tempo) {
                return totalSeconds;
            }

            // Calculate the difference and tempo time
            const timeSinceLastTempo = ticks - tempo.ticks;
            totalSeconds +=
                (timeSinceLastTempo * 60) / (tempo.tempo * this.timeDivision);
            ticks -= timeSinceLastTempo;
        }

        return totalSeconds;
    }

    /**
     * Gets the used programs and keys for this MIDI file with a given sound bank.
     * @param soundbank the sound bank.
     * @returns The output data is a key-value pair: "bank:program" -> Set<"key-velocity">
     */
    public getUsedProgramsAndKeys(
        soundbank: SoundBankManager | BasicSoundBank
    ): Record<string, Set<string>> {
        return getUsedProgramsAndKeys(this, soundbank);
    }

    /**
     * Updates all internal values of the MIDI.
     * @param sortEvents if the events should be sorted by ticks. Recommended to be true.
     */
    public flush(sortEvents = true) {
        if (sortEvents) {
            for (const t of this.tracks) {
                // Sort the track by ticks
                t.events.sort((e1, e2) => e1.ticks - e2.ticks);
            }
        }
        this.parseInternal();
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Calculates all note times in seconds.
     * @param minDrumLength the shortest a drum note (channel 10) can be, in seconds.
     * @returns an array of 16 channels, each channel containing its notes,
     * with their key number, velocity, absolute start time and length in seconds.
     */
    public getNoteTimes(minDrumLength = 0): NoteTime[][] {
        return getNoteTimesInternal(this, minDrumLength);
    }

    /**
     * Exports the midi as a standard MIDI file.
     * @returns the binary file data.
     */
    public write(): Uint8Array<ArrayBuffer> {
        return writeMIDIInternal(this);
    }

    /**
     * Writes an RMIDI file. Note that this method modifies the MIDI file in-place.
     * @param soundBankBinary the binary sound bank to embed into the file.
     * @param soundBank the sound bank instance.
     * @param bankOffset the bank offset for RMIDI.
     * @param encoding the encoding of the RMIDI info chunk.
     * @param metadata the metadata of the file. Optional. If provided, the encoding is forced to utf-8.
     * @param correctBankOffset if the MIDI file should internally be corrected to work with the set bank offset.
     * @returns the binary file data.
     */
    public writeRMIDI(
        soundBankBinary: Uint8Array,
        soundBank: BasicSoundBank,
        bankOffset = 0,
        encoding = "Shift_JIS",
        metadata: Partial<RMIDMetadata> = {},
        correctBankOffset = true
    ): IndexedByteArray {
        return writeRMIDIInternal(
            this,
            soundBankBinary,
            soundBank,
            bankOffset,
            encoding,
            metadata,
            correctBankOffset
        );
    }

    /**
     * Allows easy editing of the file by removing channels, changing programs,
     * changing controllers and transposing channels. Note that this modifies the MIDI *in-place*.
     * @param desiredProgramChanges - The programs to set on given channels.
     * @param desiredControllerChanges - The controllers to set on given channels.
     * @param desiredChannelsToClear - The channels to remove from the sequence.
     * @param desiredChannelsToTranspose - The channels to transpose.
     */
    public modify(
        desiredProgramChanges: DesiredProgramChange[] = [],
        desiredControllerChanges: DesiredControllerChange[] = [],
        desiredChannelsToClear: number[] = [],
        desiredChannelsToTranspose: DesiredChannelTranspose[] = []
    ) {
        modifyMIDIInternal(
            this,
            desiredProgramChanges,
            desiredControllerChanges,
            desiredChannelsToClear,
            desiredChannelsToTranspose
        );
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Modifies the sequence *in-place* according to the locked presets and controllers in the given snapshot.
     * @param snapshot the snapshot to apply.
     */
    public applySnapshotToMIDI(snapshot: SynthesizerSnapshot) {
        applySnapshotInternal(this, snapshot);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Gets the MIDI's name.
     * @param encoding The encoding to use if the MIDI uses an extended code page.
     * @remarks
     * Do not call in audioWorkletGlobalScope as it uses TextDecoder
     */
    public getName(encoding = "Shift_JIS") {
        let rawName = "";
        if (this.rawName) {
            const encodingInfo = this.rmidiInfo[rmidInfoChunks.encoding];
            if (encodingInfo) {
                encoding = readBinaryString(
                    encodingInfo,
                    encodingInfo.length - 1
                );
            }
            const decoder = new TextDecoder(encoding);
            // Trim since "                                                                "
            // Is not a valid name
            // MIDI file with that name: th07_10.mid
            rawName = decoder.decode(this.rawName).trim();
        }
        return rawName || this.name || this.fileName;
    }

    /**
     * INTERNAL USE ONLY!
     */
    protected copyMetadataFrom(mid: BasicMIDI) {
        // Properties can be assigned
        this.name = mid.name;
        this.fileName = mid.fileName;
        this.timeDivision = mid.timeDivision;
        this.duration = mid.duration;
        this.copyright = mid.copyright;
        this.firstNoteOn = mid.firstNoteOn;
        this.lastVoiceEventTick = mid.lastVoiceEventTick;
        this.format = mid.format;
        this.bankOffset = mid.bankOffset;
        this.isKaraokeFile = mid.isKaraokeFile;
        this.isMultiPort = mid.isMultiPort;
        this.isDLSRMIDI = mid.isDLSRMIDI;
        this.isDLSRMIDI = mid.isDLSRMIDI;

        // Copying arrays
        this.tempoChanges = [...mid.tempoChanges];
        this.lyrics = mid.lyrics.map(
            (arr) =>
                new MIDIMessage(
                    arr.ticks,
                    arr.statusByte,
                    new IndexedByteArray(arr.data)
                )
        );
        this.portChannelOffsetMap = [...mid.portChannelOffsetMap];
        this.rawName = mid?.rawName?.slice();

        // Copying objects
        this.loop = { ...mid.loop };
        this.keyRange = { ...mid.keyRange };
        this.rmidiInfo = {};
        for (const [key, value] of Object.entries(mid.rmidiInfo)) {
            this.rmidiInfo[key as RMIDINFOChunk] = value?.slice();
        }
    }

    /**
     * Parses internal MIDI values
     */
    protected parseInternal() {
        SpessaSynthGroup("%cInterpreting MIDI events...", consoleColors.info);
        /**
         * For karaoke files, text events starting with @T are considered titles,
         * usually the first one is the title, and the latter is things such as "sequenced by" etc.
         */
        let karaokeHasTitle = false;

        this.keyRange = { max: 0, min: 127 };

        const copyrightComponents: string[] = [];

        let nameDetected = false;
        if (typeof this.rmidiInfo.INAM !== "undefined") {
            // Same as with copyright
            nameDetected = true;
        }

        // Loop tracking
        let loopStart = null;
        let loopEnd = null;

        for (const track of this.tracks) {
            const usedChannels = new Set<number>();
            let trackHasVoiceMessages = false;

            for (const e of track.events) {
                // Check if it's a voice message
                if (e.statusByte >= 0x80 && e.statusByte < 0xf0) {
                    trackHasVoiceMessages = true;
                    // Voice messages are 7-bit always
                    for (let j = 0; j < e.data.length; j++) {
                        e.data[j] = Math.min(127, e.data[j]);
                    }
                    // Last voice event tick
                    if (e.ticks > this.lastVoiceEventTick) {
                        this.lastVoiceEventTick = e.ticks;
                    }

                    // Interpret the voice message
                    switch (e.statusByte & 0xf0) {
                        // Cc change: loop points
                        case midiMessageTypes.controllerChange:
                            switch (e.data[0]) {
                                case 2:
                                case 116:
                                    loopStart = e.ticks;
                                    break;

                                case 4:
                                case 117:
                                    if (loopEnd === null) {
                                        loopEnd = e.ticks;
                                    } else {
                                        // This controller has occurred more than once;
                                        // This means
                                        // That it doesn't indicate the loop
                                        loopEnd = 0;
                                    }
                                    break;

                                case 0:
                                    // Check RMID
                                    if (
                                        this.isDLSRMIDI &&
                                        e.data[1] !== 0 &&
                                        e.data[1] !== 127
                                    ) {
                                        SpessaSynthInfo(
                                            "%cDLS RMIDI with offset 1 detected!",
                                            consoleColors.recognized
                                        );
                                        this.bankOffset = 1;
                                    }
                            }
                            break;

                        // Note on: used notes tracking and key range
                        case midiMessageTypes.noteOn: {
                            usedChannels.add(e.statusByte & 0x0f);
                            const note = e.data[0];
                            this.keyRange.min = Math.min(
                                this.keyRange.min,
                                note
                            );
                            this.keyRange.max = Math.max(
                                this.keyRange.max,
                                note
                            );
                            break;
                        }
                    }
                }
                const eventText = readBinaryString(e.data);
                // Interpret the message
                switch (e.statusByte) {
                    case midiMessageTypes.setTempo:
                        // Add the tempo change
                        this.tempoChanges.push({
                            ticks: e.ticks,
                            tempo: 60000000 / readBigEndian(e.data, 3)
                        });
                        break;

                    case midiMessageTypes.marker:
                        // Check for loop markers
                        {
                            const text = eventText.trim().toLowerCase();
                            switch (text) {
                                default:
                                    break;

                                case "start":
                                case "loopstart":
                                    loopStart = e.ticks;
                                    break;

                                case "loopend":
                                    loopEnd = e.ticks;
                            }
                        }
                        break;

                    case midiMessageTypes.copyright:
                        copyrightComponents.push(
                            readBinaryString(e.data, e.data.length, 0, false)
                        );

                        break;
                    // Fallthrough

                    case midiMessageTypes.lyric:
                        // Note here: .kar files sometimes just use...
                        // Lyrics instead of text because why not (of course)
                        // Perform the same check for @KMIDI KARAOKE FILE
                        if (
                            eventText.trim().startsWith("@KMIDI KARAOKE FILE")
                        ) {
                            this.isKaraokeFile = true;
                            SpessaSynthInfo(
                                "%cKaraoke MIDI detected!",
                                consoleColors.recognized
                            );
                        }

                        if (this.isKaraokeFile) {
                            // Replace the type of the message with text
                            e.statusByte = midiMessageTypes.text;
                        } else {
                            // Add lyrics like a regular midi file
                            this.lyrics.push(e);
                        }

                    // Kar: treat the same as text
                    // Fallthrough
                    case midiMessageTypes.text: {
                        // Possibly Soft Karaoke MIDI file
                        // It has a text event at the start of the file
                        // "@KMIDI KARAOKE FILE"
                        const checkedText = eventText.trim();
                        if (checkedText.startsWith("@KMIDI KARAOKE FILE")) {
                            this.isKaraokeFile = true;

                            SpessaSynthInfo(
                                "%cKaraoke MIDI detected!",
                                consoleColors.recognized
                            );
                        } else if (this.isKaraokeFile) {
                            // Check for @T (title)
                            // Or @A because it is a title too sometimes?
                            // IDK it's strange
                            if (
                                checkedText.startsWith("@T") ||
                                checkedText.startsWith("@A")
                            ) {
                                if (!karaokeHasTitle) {
                                    this.name = checkedText.substring(2).trim();
                                    karaokeHasTitle = true;
                                    nameDetected = true;
                                } else {
                                    // Append to copyright
                                    copyrightComponents.push(
                                        checkedText.substring(2).trim()
                                    );
                                }
                            } else if (!checkedText.startsWith("@")) {
                                // Non @: the lyrics
                                this.lyrics.push(e);
                            }
                        }
                        break;
                    }

                    case midiMessageTypes.trackName:
                        break;
                }
            }
            // Add used channels
            track.channels = usedChannels;

            // Track name
            track.name = "";
            const trackName = track.events.find(
                (e) => e.statusByte === midiMessageTypes.trackName
            );
            if (trackName) {
                const name = readBinaryString(trackName.data);
                track.name = name;
                // If the track has no voice messages, its "track name" event (if it has any)
                // Is some metadata.
                // Add it to copyright
                if (!trackHasVoiceMessages) {
                    copyrightComponents.push(name);
                }
            }
        }

        // Reverse the tempo changes
        this.tempoChanges.reverse();

        SpessaSynthInfo(
            `%cCorrecting loops, ports and detecting notes...`,
            consoleColors.info
        );

        const firstNoteOns = [];
        for (const t of this.tracks) {
            const firstNoteOn = t.events.find(
                (e) => (e.statusByte & 0xf0) === midiMessageTypes.noteOn
            );
            if (firstNoteOn) {
                firstNoteOns.push(firstNoteOn.ticks);
            }
        }
        this.firstNoteOn = Math.min(...firstNoteOns);

        SpessaSynthInfo(
            `%cFirst note-on detected at: %c${this.firstNoteOn}%c ticks!`,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info
        );

        if (loopStart !== null && loopEnd === null) {
            // Not a loop
            loopStart = this.firstNoteOn;
            loopEnd = this.lastVoiceEventTick;
        } else {
            loopStart ??= this.firstNoteOn;

            if (loopEnd === null || loopEnd === 0) {
                loopEnd = this.lastVoiceEventTick;
            }
        }

        /**
         *
         * @type {{start: number, end: number}}
         */
        this.loop = { start: loopStart, end: loopEnd };

        SpessaSynthInfo(
            `%cLoop points: start: %c${this.loop.start}%c end: %c${this.loop.end}`,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            consoleColors.recognized
        );

        // Determine ports
        let portOffset = 0;
        this.portChannelOffsetMap = [];
        for (const track of this.tracks) {
            track.port = -1;
            if (track.channels.size === 0) {
                continue;
            }
            for (const e of track.events) {
                if (e.statusByte !== midiMessageTypes.midiPort) {
                    continue;
                }
                const port = e.data[0];
                track.port = port;
                if (this.portChannelOffsetMap[port] === undefined) {
                    this.portChannelOffsetMap[port] = portOffset;
                    portOffset += 16;
                }
            }
        }

        // Fix empty port channel offsets (do a copy to turn empty slots into undefined so the map goes over them)
        this.portChannelOffsetMap = [...this.portChannelOffsetMap].map(
            (o) => o ?? 0
        );

        // Fix midi ports:
        // Midi tracks without ports will have a value of -1
        // If all ports have a value of -1, set it to 0,
        // Otherwise take the first midi port and replace all -1 with it,
        // Why would we do this?
        // Some midis (for some reason) specify all channels to port 1 or else,
        // But leave the conductor track with no port pref.
        // This spessasynth to reserve the first 16 channels for the conductor track
        // (which doesn't play anything) and use the additional 16 for the actual ports.
        let defaultPort = Infinity;
        for (const track of this.tracks) {
            if (track.port !== -1) {
                if (defaultPort > track.port) {
                    defaultPort = track.port;
                }
            }
        }
        if (defaultPort === Infinity) {
            defaultPort = 0;
        }
        for (const track of this.tracks) {
            if (track.port === -1 || track.port === undefined) {
                track.port = defaultPort;
            }
        }
        // Add fake port if empty
        if (this.portChannelOffsetMap.length === 0) {
            this.portChannelOffsetMap = [0];
        }
        if (this.portChannelOffsetMap.length < 2) {
            SpessaSynthInfo(
                `%cNo additional MIDI Ports detected.`,
                consoleColors.info
            );
        } else {
            this.isMultiPort = true;
            SpessaSynthInfo(`%cMIDI Ports detected!`, consoleColors.recognized);
        }

        // Midi name
        if (!nameDetected) {
            if (this.tracks.length > 1) {
                // If more than 1 track and the first track has no notes,
                // Just find the first trackName in the first track.
                if (
                    this.tracks[0].events.find(
                        (message) =>
                            message.statusByte >= midiMessageTypes.noteOn &&
                            message.statusByte < midiMessageTypes.polyPressure
                    ) === undefined
                ) {
                    const name = this.tracks[0].events.find(
                        (message) =>
                            message.statusByte === midiMessageTypes.trackName
                    );
                    if (name) {
                        this.rawName = name.data;
                        this.name = readBinaryString(
                            name.data,
                            name.data.length,
                            0,
                            false
                        );
                    }
                }
            } else {
                // If only 1 track, find the first "track name" event
                const name = this.tracks[0].events.find(
                    (message) =>
                        message.statusByte === midiMessageTypes.trackName
                );
                if (name) {
                    this.rawName = name.data;
                    this.name = readBinaryString(
                        name.data,
                        name.data.length,
                        0,
                        false
                    );
                }
            }
        }

        this.extraMetadata = copyrightComponents
            // Trim and group newlines into one
            .map((c) => c.trim().replace(/(\r?\n)+/g, "\n"))
            // Remove empty strings
            .filter((c) => c.length > 0);

        this.name = this.name.trim();
        // If name is "", use the file name
        if (this.name.length === 0) {
            SpessaSynthInfo(`%cNo name detected.`, consoleColors.unrecognized);
            this.name = "";
        } else {
            SpessaSynthInfo(
                `%cMIDI Name detected! %c"${this.name}"`,
                consoleColors.info,
                consoleColors.recognized
            );
        }

        // If the first event is not at 0 ticks, add a track name
        // https://github.com/spessasus/SpessaSynth/issues/145
        if (!this.tracks.some((t) => t.events[0].ticks === 0)) {
            const track = this.tracks[0];
            // Can copy
            let b = this?.rawName?.buffer as ArrayBuffer;
            if (!b) {
                b = getStringBytes(this.name).buffer;
            }
            track.events.unshift(
                new MIDIMessage(
                    0,
                    midiMessageTypes.trackName,
                    new IndexedByteArray(b)
                )
            );
        }
        this.duration = this.midiTicksToSeconds(this.lastVoiceEventTick);

        // Invalidate raw name if empty
        if (this.rawName && this.rawName.length < 1) {
            this.rawName = undefined;
        }

        SpessaSynthInfo("%cSuccess!", consoleColors.recognized);
        SpessaSynthGroupEnd();
    }
}
