// noinspection JSUnusedGlobalSymbols

import { MIDISequenceData } from "./midi_sequence";
import { getStringBytes, readBytesAsString } from "../utils/byte_functions/string";
import { MIDIMessage } from "./midi_message";
import { readBytesAsUintBigEndian } from "../utils/byte_functions/big_endian";
import { SpessaSynthGroup, SpessaSynthGroupEnd, SpessaSynthInfo } from "../utils/loggin";
import { consoleColors, formatTitle, sanitizeKarLyrics } from "../utils/other";
import { writeMIDIInternal } from "./midi_tools/midi_writer";
import { writeRMIDIInternal } from "./midi_tools/rmidi_writer";
import { getUsedProgramsAndKeys } from "./midi_tools/used_keys_loaded";
import { IndexedByteArray } from "../utils/indexed_array";
import { getNoteTimesInternal } from "./midi_tools/get_note_times";
import { messageTypes } from "./enums";
import type { BasicSoundBank } from "../soundbank/basic_soundbank/basic_soundbank";
import type {
    DesiredChannelTranspose,
    DesiredControllerChange,
    DesiredProgramChange,
    NoteTime,
    RMIDMetadata
} from "./types";
import { applySnapshotInternal, modifyMIDIInternal } from "./midi_tools/midi_editor";
import type { SynthesizerSnapshot } from "../synthetizer/audio_engine/snapshot/synthesizer_snapshot";
import { SoundBankManager } from "../synthetizer/audio_engine/engine_components/sound_bank_manager";
import { loadMIDIFromArrayBufferInternal } from "./midi_loader";

/**
 * BasicMIDI is the base of a complete MIDI file, used by the sequencer internally.
 * BasicMIDI is not available on the main thread, as it contains the actual track data which can be large.
 * It can be accessed by calling getMIDI() on the Sequencer.
 */
export class BasicMIDI extends MIDISequenceData {
    /**
     * The embedded sound bank in the MIDI file, represented as an ArrayBuffer, if available.
     */
    embeddedSoundBank: ArrayBuffer | undefined = undefined;

    /**
     * The actual track data of the MIDI file, represented as an array of tracks.
     * Tracks are arrays of MIDIMessage objects.
     */
    tracks: MIDIMessage[][] = [];

    /**
     * If the MIDI file is a DLS RMIDI file.
     */
    isDLSRMIDI: boolean = false;

    /**
     * Loads a MIDI file (SMF, RMIDI, XMF) from a given ArrayBuffer.
     * @param arrayBuffer The ArrayBuffer containing the binary file data.
     * @param fileName The optional name of the file, will be used if the MIDI file does not have a name.
     */
    static fromArrayBuffer(
        arrayBuffer: ArrayBuffer,
        fileName: string = ""
    ): BasicMIDI {
        const mid = new BasicMIDI();
        loadMIDIFromArrayBufferInternal(mid, arrayBuffer, fileName);
        return mid;
    }

    /**
     * Copies a MIDI (tracks are shallowly copied!)
     * @param mid the MIDI to copy
     * @returns the copied MIDI
     */
    static copyFrom(mid: BasicMIDI): BasicMIDI {
        const m = new BasicMIDI();
        m._copyFromSequence(mid);

        m.isDLSRMIDI = mid.isDLSRMIDI;
        m.embeddedSoundBank = mid?.embeddedSoundBank
            ? mid.embeddedSoundBank
            : undefined; // Shallow copy
        m.tracks = mid.tracks.map((track) => [...track]); // Shallow copy of each track array
        return m;
    }

    /**
     * Copies a MIDI with deep copy
     * @param mid the MIDI to copy
     * @returns the copied MIDI
     */
    static copyFromDeep(mid: BasicMIDI): BasicMIDI {
        const m = new BasicMIDI();
        m._copyFromSequence(mid);
        m.isDLSRMIDI = mid.isDLSRMIDI;
        m.embeddedSoundBank = mid.embeddedSoundBank
            ? mid.embeddedSoundBank.slice(0)
            : undefined; // Deep copy
        m.tracks = mid.tracks.map((track) =>
            track.map(
                (event) =>
                    new MIDIMessage(
                        event.ticks,
                        event.messageStatusByte,
                        event.messageData
                    )
            )
        ); // Deep copy
        return m;
    }

    /**
     * Gets the used programs and keys for this MIDI file with a given sound bank.
     * @param soundbank the sound bank.
     * @returns The output data is a key-value pair: "bank:program" -> Set<"key-velocity">
     */
    getUsedProgramsAndKeys(
        soundbank: SoundBankManager | BasicSoundBank
    ): Record<string, Set<string>> {
        return getUsedProgramsAndKeys(this, soundbank);
    }

    /**
     * Updates all internal values of the MIDI.
     * @param sortEvents if the events should be sorted by ticks. Recommended to be true.
     */
    flush(sortEvents = true) {
        if (sortEvents) {
            for (const t of this.tracks) {
                // sort the track by ticks
                t.sort((e1, e2) => e1.ticks - e2.ticks);
            }
        }
        this.parseInternal();
    }

    /**
     * Calculates all note times in seconds.
     * @param minDrumLength the shortest a drum note (channel 10) can be, in seconds.
     * @returns an array of 16 channels, each channel containing its notes,
     * with their key number, velocity, absolute start time and length in seconds.
     */
    getNoteTimes(minDrumLength: number = 0): NoteTime[][] {
        return getNoteTimesInternal(this, minDrumLength);
    }

    /**
     * Exports the midi as a standard MIDI file.
     * @returns the binary file data.
     */
    writeMIDI(): Uint8Array<ArrayBuffer> {
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
    writeRMIDI(
        soundBankBinary: Uint8Array,
        soundBank: BasicSoundBank,
        bankOffset: number = 0,
        encoding: string = "Shift_JIS",
        metadata: Partial<RMIDMetadata> = {},
        correctBankOffset: boolean = true
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
    modifyMIDI(
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

    /**
     * Modifies the sequence *in-place* according to the locked presets and controllers in the given snapshot.
     * @param snapshot the snapshot to apply.
     */
    applySnapshotToMIDI(snapshot: SynthesizerSnapshot) {
        applySnapshotInternal(this, snapshot);
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
        let karaokeHasTitle: boolean = false;

        this.keyRange = { max: 0, min: 127 };

        /**
         * Will be joined with "\n" to form the final string
         * @type {string[]}
         */
        const copyrightComponents: string[] = [];
        let copyrightDetected = false;
        if (typeof this.RMIDInfo["ICOP"] !== "undefined") {
            // if RMIDI has copyright info, don't try to detect one.
            copyrightDetected = true;
        }

        let nameDetected = false;
        if (typeof this.RMIDInfo["INAM"] !== "undefined") {
            // same as with copyright
            nameDetected = true;
        }

        // loop tracking
        let loopStart = null;
        let loopEnd = null;

        for (let i = 0; i < this.tracks.length; i++) {
            const track: MIDIMessage[] = this.tracks[i];
            const usedChannels = new Set<number>();
            let trackHasVoiceMessages = false;

            for (const e of track) {
                // check if it's a voice message
                if (e.messageStatusByte >= 0x80 && e.messageStatusByte < 0xf0) {
                    trackHasVoiceMessages = true;
                    // voice messages are 7-bit always
                    for (let j = 0; j < e.messageData.length; j++) {
                        e.messageData[j] = Math.min(127, e.messageData[j]);
                    }
                    // last voice event tick
                    if (e.ticks > this.lastVoiceEventTick) {
                        this.lastVoiceEventTick = e.ticks;
                    }

                    // interpret the voice message
                    switch (e.messageStatusByte & 0xf0) {
                        // cc change: loop points
                        case messageTypes.controllerChange:
                            switch (e.messageData[0]) {
                                case 2:
                                case 116:
                                    loopStart = e.ticks;
                                    break;

                                case 4:
                                case 117:
                                    if (loopEnd === null) {
                                        loopEnd = e.ticks;
                                    } else {
                                        // this controller has occurred more than once;
                                        // this means
                                        // that it doesn't indicate the loop
                                        loopEnd = 0;
                                    }
                                    break;

                                case 0:
                                    // check RMID
                                    if (
                                        this.isDLSRMIDI &&
                                        e.messageData[1] !== 0 &&
                                        e.messageData[1] !== 127
                                    ) {
                                        SpessaSynthInfo(
                                            "%cDLS RMIDI with offset 1 detected!",
                                            consoleColors.recognized
                                        );
                                        this.bankOffset = 1;
                                    }
                            }
                            break;

                        // note on: used notes tracking and key range
                        case messageTypes.noteOn: {
                            usedChannels.add(e.messageStatusByte & 0x0f);
                            const note = e.messageData[0];
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
                e.messageData.currentIndex = 0;
                const eventText = readBytesAsString(
                    e.messageData,
                    e.messageData.length
                );
                e.messageData.currentIndex = 0;
                // interpret the message
                switch (e.messageStatusByte) {
                    case messageTypes.setTempo:
                        // add the tempo change
                        e.messageData.currentIndex = 0;
                        this.tempoChanges.push({
                            ticks: e.ticks,
                            tempo:
                                60000000 /
                                readBytesAsUintBigEndian(e.messageData, 3)
                        });
                        e.messageData.currentIndex = 0;
                        break;

                    case messageTypes.marker:
                        // check for loop markers
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
                            e.messageData.currentIndex = 0;
                        }
                        break;

                    case messageTypes.copyright:
                        if (!copyrightDetected) {
                            e.messageData.currentIndex = 0;
                            copyrightComponents.push(
                                readBytesAsString(
                                    e.messageData,
                                    e.messageData.length,
                                    false
                                )
                            );
                            e.messageData.currentIndex = 0;
                        }
                        break;
                    // fallthrough

                    case messageTypes.lyric:
                        // note here: .kar files sometimes just use...
                        // lyrics instead of text because why not (of course)
                        // perform the same check for @KMIDI KARAOKE FILE
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
                            // replace the type of the message with text
                            e.messageStatusByte = messageTypes.text;
                        } else {
                            // add lyrics like a regular midi file
                            this.lyrics.push(e.messageData);
                            this.lyricsTicks.push(e.ticks);
                        }

                    // kar: treat the same as text
                    // fallthrough
                    case messageTypes.text: {
                        // possibly Soft Karaoke MIDI file
                        // it has a text event at the start of the file
                        // "@KMIDI KARAOKE FILE"
                        const checkedText = eventText.trim();
                        if (checkedText.startsWith("@KMIDI KARAOKE FILE")) {
                            this.isKaraokeFile = true;

                            SpessaSynthInfo(
                                "%cKaraoke MIDI detected!",
                                consoleColors.recognized
                            );
                        } else if (this.isKaraokeFile) {
                            // check for @T (title)
                            // or @A because it is a title too sometimes?
                            // IDK it's strange
                            if (
                                checkedText.startsWith("@T") ||
                                checkedText.startsWith("@A")
                            ) {
                                if (!karaokeHasTitle) {
                                    this.midiName = checkedText
                                        .substring(2)
                                        .trim();
                                    karaokeHasTitle = true;
                                    nameDetected = true;
                                    // encode to rawMidiName
                                    this.rawMidiName = getStringBytes(
                                        this.midiName
                                    );
                                } else {
                                    // append to copyright
                                    copyrightComponents.push(
                                        checkedText.substring(2).trim()
                                    );
                                }
                            } else if (checkedText[0] !== "@") {
                                // non @: the lyrics
                                this.lyrics.push(
                                    sanitizeKarLyrics(e.messageData)
                                );
                                this.lyricsTicks.push(e.ticks);
                            }
                        }
                        break;
                    }

                    case messageTypes.trackName:
                        break;
                }
            }
            // add used channels
            this.usedChannelsOnTrack.push(usedChannels);

            // track name
            this.trackNames[i] = "";
            const trackName = track.find(
                (e) => e.messageStatusByte === messageTypes.trackName
            );
            if (trackName) {
                trackName.messageData.currentIndex = 0;
                const name = readBytesAsString(
                    trackName.messageData,
                    trackName.messageData.length
                );
                this.trackNames[i] = name;
                // If the track has no voice messages, its "track name" event (if it has any)
                // is some metadata.
                // Add it to copyright
                if (!trackHasVoiceMessages) {
                    copyrightComponents.push(name);
                }
            }
        }

        // reverse the tempo changes
        this.tempoChanges.reverse();

        SpessaSynthInfo(
            `%cCorrecting loops, ports and detecting notes...`,
            consoleColors.info
        );

        const firstNoteOns = [];
        for (const t of this.tracks) {
            const firstNoteOn = t.find(
                (e) => (e.messageStatusByte & 0xf0) === messageTypes.noteOn
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
            // not a loop
            loopStart = this.firstNoteOn;
            loopEnd = this.lastVoiceEventTick;
        } else {
            if (loopStart === null) {
                loopStart = this.firstNoteOn;
            }

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

        // determine ports
        let portOffset = 0;
        this.midiPorts = [];
        this.midiPortChannelOffsets = [];
        for (let trackNum = 0; trackNum < this.tracks.length; trackNum++) {
            this.midiPorts.push(-1);
            if (this.usedChannelsOnTrack[trackNum].size === 0) {
                continue;
            }
            for (const e of this.tracks[trackNum]) {
                if (e.messageStatusByte !== messageTypes.midiPort) {
                    continue;
                }
                const port = e.messageData[0];
                this.midiPorts[trackNum] = port;
                if (this.midiPortChannelOffsets[port] === undefined) {
                    this.midiPortChannelOffsets[port] = portOffset;
                    portOffset += 16;
                }
            }
        }

        // fix empty port channel offsets (do a copy to turn empty slots into undefined so the map goes over them)
        this.midiPortChannelOffsets = [...this.midiPortChannelOffsets].map(
            (o) => o ?? 0
        );

        // fix midi ports:
        // midi tracks without ports will have a value of -1
        // if all ports have a value of -1, set it to 0,
        // otherwise take the first midi port and replace all -1 with it,
        // why would we do this?
        // some midis (for some reason) specify all channels to port 1 or else,
        // but leave the conductor track with no port pref.
        // this spessasynth to reserve the first 16 channels for the conductor track
        // (which doesn't play anything) and use the additional 16 for the actual ports.
        let defaultPort = Infinity;
        for (const port of this.midiPorts) {
            if (port !== -1) {
                if (defaultPort > port) {
                    defaultPort = port;
                }
            }
        }
        if (defaultPort === Infinity) {
            defaultPort = 0;
        }
        this.midiPorts = this.midiPorts.map((port) =>
            port === -1 || port === undefined ? defaultPort : port
        );
        // add fake port if empty
        if (this.midiPortChannelOffsets.length === 0) {
            this.midiPortChannelOffsets = [0];
        }
        if (this.midiPortChannelOffsets.length < 2) {
            SpessaSynthInfo(
                `%cNo additional MIDI Ports detected.`,
                consoleColors.info
            );
        } else {
            this.isMultiPort = true;
            SpessaSynthInfo(`%cMIDI Ports detected!`, consoleColors.recognized);
        }

        // midi name
        if (!nameDetected) {
            if (this.tracks.length > 1) {
                // if more than 1 track and the first track has no notes,
                // just find the first trackName in the first track.
                if (
                    this.tracks[0].find(
                        (message) =>
                            message.messageStatusByte >= messageTypes.noteOn &&
                            message.messageStatusByte <
                                messageTypes.polyPressure
                    ) === undefined
                ) {
                    const name = this.tracks[0].find(
                        (message) =>
                            message.messageStatusByte === messageTypes.trackName
                    );
                    if (name) {
                        this.rawMidiName = name.messageData;
                        name.messageData.currentIndex = 0;
                        this.midiName = readBytesAsString(
                            name.messageData,
                            name.messageData.length,
                            false
                        );
                    }
                }
            } else {
                // if only 1 track, find the first "track name" event
                const name = this.tracks[0].find(
                    (message) =>
                        message.messageStatusByte === messageTypes.trackName
                );
                if (name) {
                    this.rawMidiName = name.messageData;
                    name.messageData.currentIndex = 0;
                    this.midiName = readBytesAsString(
                        name.messageData,
                        name.messageData.length,
                        false
                    );
                }
            }
        }

        if (!copyrightDetected) {
            this.copyright =
                copyrightComponents
                    // trim and group newlines into one
                    .map((c) => c.trim().replace(/(\r?\n)+/g, "\n"))
                    // remove empty strings
                    .filter((c) => c.length > 0)
                    // join with newlines
                    .join("\n") || "";
        }

        this.midiName = this.midiName.trim();
        this.midiNameUsesFileName = false;
        // if midiName is "", use the file name
        if (this.midiName.length === 0) {
            SpessaSynthInfo(
                `%cNo name detected. Using the alt name!`,
                consoleColors.info
            );
            this.midiName = formatTitle(this.fileName);
            this.midiNameUsesFileName = true;
            // encode it too
            this.rawMidiName = new Uint8Array(this.midiName.length);
            for (let i = 0; i < this.midiName.length; i++) {
                this.rawMidiName[i] = this.midiName.charCodeAt(i);
            }
        } else {
            SpessaSynthInfo(
                `%cMIDI Name detected! %c"${this.midiName}"`,
                consoleColors.info,
                consoleColors.recognized
            );
        }

        // if the first event is not at 0 ticks, add a track name
        // https://github.com/spessasus/SpessaSynth/issues/145
        if (!this.tracks.some((t) => t[0].ticks === 0)) {
            const track = this.tracks[0];
            // can copy
            const b: ArrayBuffer = this.rawMidiName.buffer as ArrayBuffer;
            track.unshift(
                new MIDIMessage(
                    0,
                    messageTypes.trackName,
                    new IndexedByteArray(b)
                )
            );
        }

        /**
         * The total playback time, in seconds
         * @type {number}
         */
        this.duration = this.MIDIticksToSeconds(this.lastVoiceEventTick);

        SpessaSynthInfo("%cSuccess!", consoleColors.recognized);
        SpessaSynthGroupEnd();
    }
}

/**
 * The MIDI class is a MIDI file parser that reads a MIDI file and extracts all the necessary information from it.
 * Supported formats are .mid and .rmi files.
 * @deprecated use `BasicMIDI.fromArrayBuffer` instead.
 */
export class MIDI extends BasicMIDI {
    /**
     * Parses a given MIDI file.
     * @param arrayBuffer the MIDI file array buffer.
     * @param fileName {string} optional, replaces the decoded title if empty.
     * @deprecated use `BasicMIDI.fromArrayBuffer` instead.
     */
    constructor(arrayBuffer: ArrayBuffer, fileName: string = "") {
        super();
        loadMIDIFromArrayBufferInternal(this, arrayBuffer, fileName);
    }
}
