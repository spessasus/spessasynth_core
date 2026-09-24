import type { MIDIPatchFull } from "../soundbank/basic_soundbank/midi_patch";
import type {
    GenericRange,
    PresetsWithKeyCombinations
} from "../soundbank/types";
import type { SynthesizerSnapshot } from "../synthesizer/audio_engine/synthesizer_snapshot";
import type { SpessaSynthProcessor } from "../synthesizer/processor";
import { readBigEndian } from "../utils/byte_functions/big_endian";
import {
    getStringBytes,
    readBinaryString
} from "../utils/byte_functions/string";
import { parseDateString, toISODateString } from "../utils/date";
import { fillWithDefaults } from "../utils/fill_with_defaults";
import { IndexedByteArray } from "../utils/indexed_array";
import { SpessaLog } from "../utils/loggin";
import { ConsoleColors, formatTime } from "../utils/other";
import { MIDIControllers, MIDIMessageTypes } from "./enums";
import { MIDIMessage } from "./midi_message";
import { applySnapshotInternal } from "./midi_tools/apply_snapshot";
import { getNoteTimesInternal } from "./midi_tools/get_note_times";
import { MIDIEditor, type ModifyMIDIOptions } from "./midi_tools/midi_editor";
import { getUsedProgramsAndKeys } from "./midi_tools/used_programs_and_keys";
import { MIDITrack } from "./midi_track";
import { parseSMFInternal } from "./read/midi";
import { parseRMIDIInternal } from "./read/rmidi";
import { loadXMF } from "./read/xmf";
import type {
    CallableSoundBank,
    MIDIFormat,
    MIDILoop,
    NoteTime,
    RMIDInfoData,
    RMIDIWriteOptions,
    TempoChange,
    TimelineEvent
} from "./types";
import { writeMIDIInternal } from "./write/midi";
import { DEFAULT_RMIDI_WRITE_OPTIONS, writeRMIDIInternal } from "./write/rmidi";

/**
 * BasicMIDI is the base of a complete MIDI file.
 * It represents a single MIDI sequence, with an optional sound bank attached to it.
 *
 * Initialize the class using {@link BasicMIDI.fromArrayBuffer}.
 *
 * @group MIDI
 */
export class BasicMIDI {
    /**
     * The tracks in the sequence, represented as an array of {@link MIDITrack}.
     */
    public tracks: MIDITrack[] = [];

    /**
     * A flattened, time‑sorted list of all events in the MIDI sequence.
     * The order between the tracks is preserved.
     * Each entry points to the event's track number and its index within that track.
     * This is the recommended way of iterating over the MIDI sequence's events.
     *
     * > **Tip**
     * >
     * > This is the recommended way of iterating over the MIDI sequence's events.
     *
     * > **Warning**
     * >
     * > Do not change this array.
     * > If you need to edit the file while iterating over it,
     * > consider using {@link BasicMIDI.iterate} instead.
     */
    public readonly timeline: readonly Readonly<TimelineEvent>[] = [];

    /**
     * The time division of the MIDI file. The amount of MIDI ticks per beat, usually 480 ticks.
     * Essentially the resolution of the file.
     *
     * For example a time division of 1 would mean that one MIDI tick (the smallest time unit) lasts one beat,
     * so no shorter notes can be stored in the file.
     */
    public timeDivision = 480;

    /**
     * The duration of the sequence, in seconds.
     *
     * > **Note**
     * >
     * > The MIDI file's duration is the start of the file to {@link BasicMIDI.lastVoiceEventTick}.
     * > To alter the end time,
     * > add a controller change (preferably an unused CC, like CC#50) at the time you want the file to end,
     * > then run {@link BasicMIDI.flush}
     */
    public duration = 0;

    /**
     * The tempo changes in the sequence, ordered from the last change to the first.
     * Each change is represented by an object with a MIDI tick position and a tempo value in beats per minute.
     *
     * It will always contain at least one tempo change (the default 120BPM at zero ticks).
     *
     * @example
     *
     * ```ts
     * [
     *     {
     *         tempo: 140 // tempo in BPM ,
     *         ticks: 5437 // absolute amount of MIDI Ticks from the start
     *     },
     *
     *     // ...
     *
     *     {
     *         // the default tempo change
     *         tempo: 120,
     *         ticks: 0
     *     }
     * ];
     * ```
     */
    public tempoChanges: TempoChange[] = [{ ticks: 0, tempo: 120 }];

    /**
     * Any extra metadata found in the file.
     * These messages were deemed "interesting" by the parsing algorithm
     * and can be displayed by the MIDI player as some form of metadata.
     */
    public extraMetadata: MIDIMessage[] = [];

    /**
     * An array containing the lyrics of the sequence.
     */
    public lyrics: MIDIMessage[] = [];

    /**
     * The MIDI tick time of the first note-on event in the MIDI sequence.
     */
    public firstNoteOn = 0;

    /**
     * The MIDI key range used in the sequence,
     * represented by a minimum and maximum MIDI note numbers.
     */
    public keyRange: GenericRange = { min: 0, max: 127 };

    /**
     * The MIDI tick time of the last voice event (such as note-on, note-off, or control change) in the sequence.
     *
     * > **Note**
     * >
     * > To alter the end time,
     * > add a controller change (preferably an unused CC,
     * > like CC#50) at the time you want the file to end,
     * > then run {@link BasicMIDI.flush}
     */
    public lastVoiceEventTick = 0;

    /**
     * An array of channel offsets for each MIDI port, using the [SpessaSynth method](../../docs/extra/about-multi-port.md#spessasynth-implementation).
     * The index is the port number and the value is the channel offset.
     *
     */
    public portChannelOffsetMap: number[] = [0];

    /**
     * The loop points (in ticks) of the sequence, including both start and end points.
     *
     * If there's nothing detected, the loop will start from the first note on event and end will be the last voice message.
     * Current looping detection is: CC 2/4, 116/117 and "start," "loopStart" and "loopEnd" markers.
     */
    public loop: MIDILoop = { start: 0, end: 0, type: "hard" };

    /**
     * The file name of the MIDI sequence, if provided during parsing.
     */
    public fileName?: string;

    /**
     * The [MIDI file format.](https://www.music.mcgill.ca/~ich/classes/mumt306/StandardMIDIfileformat.html#BM2_2) Usually 0 or
     * 1, rarely 2, indicating the type of the MIDI file.
     */
    public format: MIDIFormat = 0;

    /**
     * The RMID (Resource-Interchangeable MIDI) info data, if the file is RMID formatted.
     * Otherwise, this object is empty.
     * Info type: Chunk data as a binary array.
     *
     * > **Note**
     * >
     * > Text chunks contain a terminal zero byte, please take that into account when feeding the data to a `TextDecoder`.
     * > {@link BasicMIDI.getRMIDInfo} takes care of this automatically.
     *
     * > **Tip**
     * >
     * > See [SF2 RMIDI Extension Specification](https://github.com/spessasus/sf2-rmidi-specification#readme) for more info.
     */
    public rmidiInfo: Partial<
        Record<keyof RMIDInfoData, Uint8Array<ArrayBuffer>>
    > = {};

    /**
     * The bank offset used for RMID files.
     * Only applies to RMID, for normal MIDIs it's set to 0.
     */
    public bankOffset = 0;

    /**
     * If the MIDI file is a Soft Karaoke file (.kar), this is set to true.
     * [More information about this format here.](https://www.mixagesoftware.com/en/midikit/help/HTML/karaoke_formats.html)
     */
    public isKaraokeFile = false;

    /**
     * Indicates if this file is a Multi-Port MIDI file.
     */
    public isMultiPort = false;

    /**
     * If the MIDI file is a DLS RMIDI file.
     *
     * > **Tip**
     * >
     * > See [SF2 RMIDI Extension Specification](https://github.com/spessasus/sf2-rmidi-specification#readme) for more info.
     */
    public isDLSRMIDI = false;

    /**
     * The embedded sound bank in the MIDI file, represented as the binary `ArrayBuffer`,
     * if available. It will be undefined for regular MIDI files.
     *
     * > **Warning**
     * >
     * > If the embedded sound bank is defined, {@link SpessaSynthSequencer} will automatically pass it to the synthesizer.
     * > If you want to avoid this behavior, make sure you set it to undefined before passing the BasicMIDI.
     */
    public embeddedSoundBank?: ArrayBuffer;

    /**
     * The raw, encoded MIDI name, represented as a Uint8Array.
     * Useful when the MIDI file uses a different code page.
     * Undefined if no MIDI name could be found.
     */
    protected binaryName?: Uint8Array;

    /**
     * The encoding of the RMIDI info in file (for example `Shift_JIS` or `utf-8`), if specified.
     * Otherwise, undefined.
     */
    public get infoEncoding() {
        const encodingInfo = this.rmidiInfo.infoEncoding;
        if (!encodingInfo) {
            return undefined;
        }
        let lengthToRead = encodingInfo.byteLength;
        // Some files don't have a terminal zero
        if (encodingInfo[encodingInfo.byteLength - 1] === 0) {
            lengthToRead--;
        }
        return readBinaryString(encodingInfo, lengthToRead);
    }

    /**
     * Loads a MIDI file (SMF, RMIDI, XMF) from a given ArrayBuffer.
     * @param arrayBuffer The ArrayBuffer containing the binary file data.
     * @param fileName The _optional_ name of the file, will be used if the MIDI file does not have a name.
     *
     * @remarks
     * This function reads the MIDI file format, extracts the header and track chunks,
     * and populates the BasicMIDI instance with the parsed data.
     * It supports Standard MIDI Files (SMF), RIFF MIDI (RMIDI), and Extensible Music Format (XMF).
     * It also handles embedded soundbanks in RMIDI files.
     */
    public static fromArrayBuffer(
        arrayBuffer: ArrayBuffer,
        fileName = ""
    ): BasicMIDI {
        const mid = new BasicMIDI();
        const binaryData = new IndexedByteArray(arrayBuffer);
        const initialString = readBinaryString(binaryData, 4);
        switch (initialString) {
            case "RIFF": {
                // Possibly an RMID file (https://github.com/spessasus/sf2-rmidi-specification#readme)
                parseRMIDIInternal(mid, binaryData, fileName);
                break;
            }

            case "XMF_": {
                // Extensible Music Format
                loadXMF(mid, binaryData, fileName);
                break;
            }

            default: {
                // Assume Standard MIDI File
                parseSMFInternal(mid, binaryData, fileName);
                break;
            }
        }
        return mid;
    }

    /**
     * Loads a MIDI file (SMF, RMIDI, XMF) from a given file.
     * @param file The file to load.
     */
    public static async fromFile(file: File) {
        // An alias for now...
        return this.fromArrayBuffer(await file.arrayBuffer(), file.name);
    }

    /**
     * Copies a `BasicMIDI` instance, including track data.
     * @param mid The MIDI to copy.
     * @returns The copied MIDI.
     */
    public static copyFrom(mid: BasicMIDI) {
        const m = new BasicMIDI();
        m.copyFrom(mid);
        return m;
    }

    /**
     * Copies another instance this `BasicMIDI` instance, including track data.
     * @param mid The MIDI to copy.
     */
    public copyFrom(mid: BasicMIDI) {
        this.copyMetadataFrom(mid);

        this.embeddedSoundBank = mid?.embeddedSoundBank?.slice(0) ?? undefined; // Deep copy
        this.tracks = mid.tracks.map((track) => MIDITrack.copyFrom(track)); // Deep copy of each track array

        // @ts-expect-error special case, otherwise readonly
        this.timeline = mid.timeline.map((t) => ({ ...t }));
    }

    /**
     * Converts MIDI ticks to time in seconds.
     * @param ticks The time in MIDI ticks.
     * @returns The returned value is the time in seconds from the start of the MIDI to the given tick.
     */
    public midiTicksToSeconds(ticks: number): number {
        ticks = Math.max(ticks, 0);
        if (this.tempoChanges.length === 0) {
            // One is added automatically, but the user may have tampered with it
            throw new Error(
                "There are no tempo changes in the sequence. At least one is needed."
            );
        }

        // Sanity check
        if (this.tempoChanges[this.tempoChanges.length - 1].ticks !== 0) {
            throw new Error(
                `The last tempo change is not at 0 ticks. Got ${this.tempoChanges[this.tempoChanges.length - 1].ticks} ticks.`
            );
        }

        // Tempo changes are reversed, so the first element is the last tempo change
        // And the last element is the first tempo change
        // (always at tick 0 and tempo 120)
        // Find the last tempo change that has occurred
        let tempoIndex = this.tempoChanges.findIndex((v) => v.ticks <= ticks);

        let totalSeconds = 0;
        while (tempoIndex < this.tempoChanges.length) {
            const tempo = this.tempoChanges[tempoIndex++];
            // Calculate the difference and tempo time
            const ticksSinceLastTempo = ticks - tempo.ticks;
            totalSeconds +=
                (ticksSinceLastTempo * 60) / (tempo.tempo * this.timeDivision);
            ticks = tempo.ticks;
        }
        return totalSeconds;
    }

    /**
     * Converts seconds to time in MIDI ticks.
     *
     * > **Note**
     * >
     * > The returned value will always be rounded to the nearest integer.
     *
     * @param seconds The time in seconds.
     * @returns The returned value is the time in MIDI ticks from the start of the MIDI to the given second.
     */
    public secondsToMIDITicks(seconds: number): number {
        seconds = Math.max(seconds, 0);
        if (seconds === 0) return 0;
        if (this.tempoChanges.length === 0) {
            // One is added automatically, but the user may have tampered with it
            throw new Error(
                "There are no tempo changes in the sequence. At least one is needed."
            );
        }

        // Sanity check
        if (this.tempoChanges[this.tempoChanges.length - 1].ticks !== 0) {
            throw new Error(
                `The last tempo change is not at 0 ticks. Got ${this.tempoChanges[this.tempoChanges.length - 1].ticks} ticks.`
            );
        }

        // Tempo changes are reversed, so the first element is the last tempo change
        // And the last element is the first tempo change
        // (always at tick 0 and tempo 120)

        let remainingSeconds = seconds;
        let totalTicks = 0;
        for (let i = this.tempoChanges.length - 1; i >= 0; i--) {
            const currentTempo = this.tempoChanges[i];
            const next: TempoChange | undefined = this.tempoChanges[i - 1];

            const ticksToNextTempo = next
                ? next.ticks - currentTempo.ticks
                : Infinity;

            const oneTickToSeconds =
                60 / (currentTempo.tempo * this.timeDivision);
            const secondsToNextTempo = ticksToNextTempo * oneTickToSeconds;

            // In this tempo change
            if (remainingSeconds <= secondsToNextTempo) {
                totalTicks += Math.round(remainingSeconds / oneTickToSeconds);
                return totalTicks;
            }

            // Not in this tempo change
            totalTicks += ticksToNextTempo;
            remainingSeconds -= secondsToNextTempo;
        }
        return totalTicks;
    }

    /**
     * Goes through the MIDI file and returns all used program numbers and MIDI key:velocity combinations for them,
     * for a given sound bank (used for capital tone fallback).
     * @param soundbank An instance of the parsed sound bank to "play" the MIDI with.
     *   Anything that implements the {@link BasicSoundBank.getPreset} method.
     *   This can be used to provide custom selectors and sound bank lists.
     * @returns The output data is a key-value pair: {@link MIDIPatchFull} -> `Map<midiNote, Set<velocity>>`
     */
    public getUsedProgramsAndKeys<T extends MIDIPatchFull>(
        soundbank: CallableSoundBank<T>
    ): PresetsWithKeyCombinations<T> {
        return getUsedProgramsAndKeys(this, soundbank);
    }

    /**
     * Preloads all voices for this sequence in a given {@link SpessaSynthProcessor}.
     * This caches all the needed voices for playing back this sequencer, resulting in a smooth playback.
     * The sequencer calls this function by default when loading the songs. (it can be disabled: {@link SpessaSynthSequencer.preload}).
     * @param synth The synthesizer to preload.
     */
    public preloadSynth(synth: SpessaSynthProcessor) {
        SpessaLog.groupCollapsed(`%cPreloading samples...`, ConsoleColors.info);
        // Smart preloading: load only samples used in the midi!
        const used = this.getUsedProgramsAndKeys(synth.soundBankManager);
        for (const [preset, keys] of used.entries()) {
            SpessaLog.info(
                `%cPreloading used samples on %c${preset.name}%c...`,
                ConsoleColors.info,
                ConsoleColors.recognized,
                ConsoleColors.info
            );
            for (const [midiNote, velocities] of keys.entries()) {
                for (const velocity of velocities) {
                    synth.getVoicesForPreset(preset, midiNote, velocity);
                }
            }
        }
        SpessaLog.groupEnd();
    }

    /**
     * Updates all parameters. Call this after editing the contents of {@link BasicMIDI.tracks} (the events).
     *
     * This updates parameters like `firstNoteOn`, `lastVoiceEventTick` or `loop`.
     *
     * > **Warning**
     * >
     * > Not calling `flush` after making any changes to the track may result in unexpected behavior.
     *
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
     * @param minDrumLength In seconds, represents the minimum allowed time for a drum note,
     *   since they sometimes have a length of 0.
     * @returns An array of 16 channels, each channel containing its notes,
     * with their key number, velocity, absolute start time and length in seconds.
     *
     * @example
     * ```ts
     * const data = [
     *     [{ midiNote: 60, velocity: 100, start: 0.5, length: 0.25 }], // channel 1
     *     // other 14 channels...
     *     [{ midiNote: 36, velocity: 96, start: 41.54, length: 0.1 }] // channel 16
     * ];
     * ```
     */
    public getNoteTimes(minDrumLength = 0): NoteTime[][] {
        return getNoteTimesInternal(this, minDrumLength);
    }

    /**
     * Exports the midi as a standard MIDI file.
     * @returns A binary representation of the Standard MIDI File.
     * 
     * @example
     * 
     * Below is a basic example of writing a modified MIDI file:
     *
     *  ```ts
     *  // create your midi and synthesizer
     *  const midi = BasicMIDI.fromArrayBuffer(yourBufferGoesHere);
     *  const synth = new SpessaSynthProcessor(44100);
     *
     *  // ...
     *
     *  // get the snapshot and apply it
     *  const snapshot = synth.getSnapshot();
     *  midi.applySnapshot(snapshot);
     *
     *  // write midi
     *  const midiBinary = midi.writeMIDI();
     *
     *  // save the file
     *  const blob = new Blob([midiBinary.buffer], { type: "audio/midi" });
     *  const url = URL.createObjectURL(blob);
     *  const a = document.createElement("a");
     *  a.href = url;
     *  a.download = midi.name + ".mid";
     *  a.click();
        ```
     * 
     */
    public writeMIDI(): ArrayBuffer {
        return writeMIDIInternal(this);
    }

    /**
     * Writes out an RMIDI file (MIDI + SF2).
     * [See more info about this format](https://github.com/spessasus/sf2-rmidi-specification#readme).
     *
     * Note that this method modifies the MIDI file in-place.
     *
     *
     * The method is called on a `BasicMIDI` instance;
     * that instance is the MIDI file to embed.
     *
     * > **Tip**
     * >
     * > Use {@link BasicSoundBank.trim} to drastically reduce the file size.
     * > consider also using compression (like shown in example) to save even more space.
     * > (using these both methods, I managed to shrink a 1GB sound bank into a 5MB RMIDI!)
     *
     * @param soundBankBinary The binary sound bank (SF2 or DLS) to embed into the file.
     * @param configuration Extra options for writing the file.
     * @returns the binary file data.
     *
     *
     * @example
     *
     * Below is a simple example for exporting an RMIDI file
     *
     * ```html
     * <label for="soundfont_upload">Upload soundfont</label>
     * <input type="file" id="soundfont_upload" />
     * <label for="midi_upload">Upload MIDI</label>
     * <input type="file" id="midi_upload" />
     * <button id="export">Export</button>
     * ```
     *
     * > **Note**
     * >
     * > This example uses soundfont3 compression.
     * > Make sure you've read {@link SampleEncodingFunction}
     *
     * ```ts
     * const sfInput = document.getElementById("soundfont_upload");
     * const midiInput = document.getElementById("midi_upload");
     * document.getElementById("export").onchange = async () => {
     *     // get the files
     *     const soundBank = SoundBankLoader.fromArrayBuffer(
     *         await sfInput.files[0].arrayBuffer()
     *     );
     *     const midi = BasicMIDI.fromArrayBuffer(
     *         await midiInput.files[0].arrayBuffer()
     *     );
     *
     *     // trim the soundfont
     *     soundBank.trim(midi);
     *     // write out with compression to save space (0.5 is medium quality)
     *     await soundBank.setSampleFormat({
     *         format: "compressed",
     *         compressionFunction: SampleEncodingFunction // Remember to get your compression function
     *     });
     *     const soundfontBinary = soundBank.writeSF2();
     *     // get the rmidi
     *     const rmidiBinary = midi.writeRMIDI(soundfontBinary, {
     *         soundBank,
     *         metadata: {
     *             name: "A cool song",
     *             artist: "John",
     *             creationDate: new Date(),
     *             album: "John's songs",
     *             genre: "Rock",
     *             comment: "My favorite!"
     *         }
     *     });
     *
     *     // save the file
     *     const blob = new Blob([rmidiBinary.buffer], { type: "audio/rmid" });
     *     const url = URL.createObjectURL(blob);
     *     const a = document.createElement("a");
     *     a.href = url;
     *     a.download = midi.name + ".rmi";
     *     a.click();
     * };
     * ```
     */
    public writeRMIDI(
        soundBankBinary: ArrayBuffer,
        configuration: Partial<RMIDIWriteOptions> = DEFAULT_RMIDI_WRITE_OPTIONS
    ): ArrayBuffer {
        return writeRMIDIInternal(
            this,
            soundBankBinary,
            fillWithDefaults(configuration, DEFAULT_RMIDI_WRITE_OPTIONS)
        );
    }

    /**
     * Allows easily modifying the sequence's programs and controllers.
     * This is a very sophisticated method that supports various MIDI systems
     * and inserts/deletes messages appropriately.
     *
     * This modifies the MIDI sequence _in-place_.
     */
    public modify(opts: Partial<ModifyMIDIOptions>) {
        const editor = new MIDIEditor(this, opts);
        editor.apply();
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Applies a {@link SynthesizerSnapshot} to the sequence _in place_.
     * This means changing the programs and controllers if they are locked.
     *
     * For example, if channel 1 has locked preset on `Drawbar Organ`,
     * this will remove all program changes for channel 1 and add one at the start to change the program to
     * `Drawbar organ` (using bank MSB/LSB and program change).
     *
     * > **Warning**
     * >
     * > `fineTune` parameter will be truncated to range -100 to 99 cents.
     *
     * > **Note**
     * >
     * > System Parameters `fineTune` and `keyShift` are passed to the relative tuning parameters of the channels.
     * > MIDI Parameters are passed directly.
     * > Only locked MIDI parameters and controllers are applied.
     *
     * @param snapshot the snapshot to apply.
     */
    public applySnapshot(snapshot: SynthesizerSnapshot) {
        applySnapshotInternal(this, snapshot);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Gets the MIDI's decoded name.
     *
     * > **Warning**
     * >
     * > Do not call in audioWorkletGlobalScope as it uses TextDecoder.
     * > The RMIDI encoding overrides the provided encoding.
     *
     * @param encoding The encoding to use if the MIDI uses an extended code page.
     * @returns Rhe name of the song or the file name if it's not specified. Otherwise, empty.
     */
    public getName(encoding = "Shift_JIS") {
        let rawName = "";
        const n = this.getRMIDInfo("name");
        if (n) {
            return n.trim();
        }
        if (this.binaryName) {
            encoding = this.getRMIDInfo("midiEncoding") ?? encoding;
            try {
                const decoder = new TextDecoder(encoding);
                // Trim since "                                                                "
                // Is not a valid name
                // MIDI file with that name: th07_10.mid
                rawName = decoder.decode(this.binaryName).trim();
            } catch (error) {
                SpessaLog.warn(
                    `Failed to decode MIDI name: ${error as string}`
                );
            }
        }
        return rawName || this.fileName;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Gets the decoded extra metadata as text and removes any unneeded characters (such as `@T` for karaoke files)
     *
     * > **Warning**
     * >
     * > Do not call in audioWorkletGlobalScope as it uses TextDecoder.
     * > The RMIDI encoding overrides the provided encoding.
     *
     * @param encoding The encoding to use if the MIDI uses an extended code page.
     * @returns An array of strings - each `extraMetadata` decoded and sanitized.
     */
    public getExtraMetadata(encoding = "Shift_JIS") {
        encoding = this.infoEncoding ?? encoding;
        const decoder = new TextDecoder(encoding);
        return this.extraMetadata.map((d) => {
            const decoded = decoder.decode(d.data);
            return decoded.replaceAll(/@T|@A/g, "").trim();
        });
    }

    /**
     * Sets a given RMIDI info value.
     *
     * > **Note**
     * >
     * > This sets the Info encoding to `utf-8`.
     *
     * @param infoType The type to set.
     * @param infoData The value to set it to.
     */
    public setRMIDInfo<K extends keyof RMIDInfoData>(
        infoType: K,
        infoData: RMIDInfoData[K]
    ) {
        this.rmidiInfo.infoEncoding = getStringBytes("utf-8", true);
        if (infoType === "picture") {
            // TS2339: Property buffer does not exist on type string | ArrayBuffer | Date
            // Property buffer does not exist on type string
            this.rmidiInfo.picture = new Uint8Array(infoData as ArrayBuffer);
        } else if (infoType === "creationDate") {
            this.rmidiInfo.creationDate = getStringBytes(
                toISODateString(infoData as Date),
                true
            );
        } else {
            const encoded = new TextEncoder().encode(infoData as string);
            // Add zero byte
            this.rmidiInfo[infoType] = new Uint8Array([...encoded, 0]);
        }
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Gets a given chunk from the RMIDI information.
     * @param infoType The metadata type.
     * @returns `string`, `Date`, `ArrayBuffer` or undefined if the info is not set.
     */
    public getRMIDInfo<K extends keyof RMIDInfoData>(
        infoType: K
    ): RMIDInfoData[K] | undefined {
        if (!this.rmidiInfo[infoType]) {
            return undefined;
        }
        const encoding = this.infoEncoding ?? "UTF-8";

        if (infoType === "picture") {
            return this.rmidiInfo[infoType].buffer as RMIDInfoData[K];
        } else if (infoType === "creationDate") {
            return parseDateString(
                readBinaryString(this.rmidiInfo[infoType])
            ) as RMIDInfoData[K];
        }

        try {
            const decoder = new TextDecoder(encoding);
            let infoBuffer = this.rmidiInfo[infoType];
            if (infoBuffer[infoBuffer.length - 1] === 0) {
                // Do not decode the terminal byte
                infoBuffer = infoBuffer?.slice(0, -1);
            }
            return decoder.decode(infoBuffer.buffer).trim() as RMIDInfoData[K];
        } catch (error) {
            SpessaLog.warn(
                `Failed to decode ${infoType} name: ${error as string}`
            );
            return undefined;
        }
    }

    /**
     * Iterates over the MIDI file, ordered by the time the events happen.
     *
     * > **Tip**
     * >
     * > Consider iterating over the {@link BasicMIDI.timeline} property
     * > if you are not editing the MIDI file in your loop.
     * > It is usually a faster solution and allows custom loops.
     *
     *     If the track data is being edited, remember to call {@link BasicMIDI.timeline} it after editing!
     *
     * @param callback The callback function to process each event.
     */
    public iterate(
        callback: (
            event: MIDIMessage,
            trackNumber: number,
            eventIndexes: number[]
        ) => unknown
    ) {
        /**
         * Indexes for tracks
         */
        const eventIndexes = new Array<number>(this.tracks.length).fill(0);
        let remainingTracks = this.tracks.length;
        while (remainingTracks > 0) {
            let trackNum = 0;
            let ticks = Infinity;
            for (let i = 0; i < this.tracks.length; i++) {
                const track = this.tracks[i].events;
                if (eventIndexes[i] >= track.length) continue;
                if (track[eventIndexes[i]].ticks < ticks) {
                    trackNum = i;
                    ticks = track[eventIndexes[i]].ticks;
                }
            }

            const track = this.tracks[trackNum].events;
            if (eventIndexes[trackNum] >= track.length) {
                remainingTracks--;
                continue;
            }
            const idx = eventIndexes[trackNum];
            callback(track[idx], trackNum, eventIndexes);
            eventIndexes[trackNum]++;
        }
    }

    /**
     * INTERNAL USE ONLY!
     */
    protected copyMetadataFrom(mid: BasicMIDI) {
        // Properties can be assigned
        this.fileName = mid.fileName;
        this.timeDivision = mid.timeDivision;
        this.duration = mid.duration;
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
        this.extraMetadata = mid.extraMetadata.map(
            (m) =>
                new MIDIMessage(
                    m.ticks,
                    m.statusByte,
                    new IndexedByteArray(m.data)
                )
        );
        this.lyrics = mid.lyrics.map(
            (arr) =>
                new MIDIMessage(
                    arr.ticks,
                    arr.statusByte,
                    new IndexedByteArray(arr.data)
                )
        );
        this.portChannelOffsetMap = [...mid.portChannelOffsetMap];
        this.binaryName = mid?.binaryName?.slice();

        // Copying objects
        this.loop = { ...mid.loop };
        this.keyRange = { ...mid.keyRange };
        this.rmidiInfo = {};
        for (const v of Object.entries(mid.rmidiInfo)) {
            const key = v[0];
            const value = v[1];
            this.rmidiInfo[key as keyof RMIDInfoData] = new Uint8Array(value);
        }
    }

    /**
     * Parses internal MIDI values
     */
    protected parseInternal() {
        SpessaLog.group("%cInterpreting MIDI events...", ConsoleColors.info);
        /**
         * For karaoke files, text events starting with @T are considered titles,
         * usually the first one is the title, and the latter is things such as "sequenced by" etc.
         */
        let karaokeHasTitle = false;

        // Reset values
        // https://github.com/spessasus/spessasynth_core/issues/20
        this.tempoChanges = [{ ticks: 0, tempo: 120 }];
        this.extraMetadata = [];
        this.lyrics = [];
        this.firstNoteOn = 0;
        this.keyRange = { max: 0, min: 127 };
        this.lastVoiceEventTick = 0;
        this.portChannelOffsetMap = [0];
        this.loop = { start: 0, end: 0, type: "hard" };
        // Do not reset RMIDI info (parsed in MIDI loader)
        // Do not reset bank offset (parsed in MIDI loader)
        this.isKaraokeFile = false;
        this.isMultiPort = false;

        let nameDetected = false;
        if (this.rmidiInfo.name !== undefined) {
            // Name is already provided in RMIDInfo
            nameDetected = true;
        }

        // Loop tracking
        let loopStart = null;
        let loopEnd = null;
        let loopType = "hard" as "hard" | "soft";

        for (const track of this.tracks) {
            const usedChannels = new Set<number>();
            let trackHasVoiceMessages = false;

            for (let i = 0; i < track.events.length; i++) {
                const e = track.events[i];
                // Check if it's a voice message
                if (e.statusByte >= 0x80 && e.statusByte < 0xf0) {
                    trackHasVoiceMessages = true;
                    // Last voice event tick
                    if (e.ticks > this.lastVoiceEventTick) {
                        this.lastVoiceEventTick = e.ticks;
                    }

                    // Interpret the voice message
                    switch (e.statusByte & 0xf0) {
                        // Cc change: loop points
                        case MIDIMessageTypes.controllerChange: {
                            switch (e.data[0]) {
                                // Touhou
                                case MIDIControllers.breathController:
                                // RPG Maker
                                case MIDIControllers.undefinedCC111LSB: {
                                    // For Touhou and RPG Maker, the data value must be 0.
                                    if (e.data[1] === 0) loopStart = e.ticks;
                                    break;
                                }
                                // EMIDI/XMI
                                case MIDIControllers.undefinedCC116LSB:
                                // EMIDI global loop
                                case MIDIControllers.undefinedCC118LSB: {
                                    loopStart = e.ticks;
                                    break;
                                }

                                // Touhou
                                case MIDIControllers.footController:
                                // EMIDI/XMI
                                case MIDIControllers.undefinedCC117LSB:
                                // EMIDI global loop
                                case MIDIControllers.undefinedCC119LSB: {
                                    // For Touhou loops, the data value must be 0.
                                    if (
                                        loopEnd === null &&
                                        (e.data[0] !== 4 ||
                                            (e.data[0] === 4 &&
                                                e.data[1] === 0))
                                    ) {
                                        loopType = "soft";
                                        loopEnd = e.ticks;
                                    } else {
                                        // This controller has occurred more than once;
                                        // This means
                                        // That it doesn't indicate the loop
                                        loopEnd = 0;
                                        loopType = "hard";
                                    }
                                    break;
                                }

                                case MIDIControllers.bankSelect: {
                                    // Check RMID
                                    if (
                                        this.isDLSRMIDI &&
                                        e.data[1] !== 0 &&
                                        e.data[1] !== 127
                                    ) {
                                        SpessaLog.info(
                                            "%cDLS RMIDI with offset 1 detected!",
                                            ConsoleColors.recognized
                                        );
                                        this.bankOffset = 1;
                                    }
                                }
                            }
                            break;
                        }

                        // Note on: used notes tracking and key range
                        case MIDIMessageTypes.noteOn: {
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
                    case MIDIMessageTypes.endOfTrack: {
                        if (i !== track.events.length - 1) {
                            track.deleteEvent(i);
                            i--;
                            SpessaLog.warn("Unexpected EndOfTrack. Removing!");
                        }
                        break;
                    }

                    case MIDIMessageTypes.setTempo: {
                        // Add the tempo change
                        this.tempoChanges.push({
                            ticks: e.ticks,
                            tempo: 60_000_000 / readBigEndian(e.data, 3)
                        });
                        break;
                    }

                    case MIDIMessageTypes.marker: {
                        // Check for loop markers
                        {
                            const text = eventText.trim().toLowerCase();
                            switch (text) {
                                default: {
                                    break;
                                }

                                case "start":
                                case "loopstart": {
                                    loopStart = e.ticks;
                                    break;
                                }

                                case "loopend": {
                                    loopEnd = e.ticks;
                                }
                            }
                        }
                        break;
                    }

                    case MIDIMessageTypes.copyright: {
                        this.extraMetadata.push(e);

                        break;
                    }
                    // Fallthrough

                    case MIDIMessageTypes.lyric: {
                        // Note here: .kar files sometimes just use...
                        // Lyrics instead of text because why not (of course)
                        // Perform the same check for @KMIDI KARAOKE FILE
                        if (
                            eventText.trim().startsWith("@KMIDI KARAOKE FILE")
                        ) {
                            this.isKaraokeFile = true;
                            SpessaLog.info(
                                "%cKaraoke MIDI detected!",
                                ConsoleColors.recognized
                            );
                        }

                        if (this.isKaraokeFile) {
                            // Replace the type of the message with text
                            e.statusByte = MIDIMessageTypes.text;
                        } else {
                            // Add lyrics like a regular midi file
                            this.lyrics.push(e);
                        }
                    }

                    // Kar: treat the same as text
                    // Fallthrough
                    case MIDIMessageTypes.text: {
                        // Possibly Soft Karaoke MIDI file
                        // It has a text event at the start of the file
                        // "@KMIDI KARAOKE FILE"
                        const checkedText = eventText.trim();
                        if (checkedText.startsWith("@KMIDI KARAOKE FILE")) {
                            this.isKaraokeFile = true;

                            SpessaLog.info(
                                "%cKaraoke MIDI detected!",
                                ConsoleColors.recognized
                            );
                        } else if (this.isKaraokeFile) {
                            // Check for @T (title)
                            // Or @A because it is a title too sometimes?
                            // IDK it's strange
                            if (
                                checkedText.startsWith("@T") ||
                                checkedText.startsWith("@A")
                            ) {
                                if (karaokeHasTitle) {
                                    // Append to metadata
                                    this.extraMetadata.push(e);
                                } else {
                                    this.binaryName = e.data.slice(2);
                                    karaokeHasTitle = true;
                                    nameDetected = true;
                                }
                            } else if (!checkedText.startsWith("@")) {
                                // Non @: the lyrics
                                this.lyrics.push(e);
                            }
                        }
                        break;
                    }
                }
            }
            // Add used channels
            track.channels = usedChannels;

            // Track name
            track.name = "";
            const trackName = track.events.find(
                (e) => e.statusByte === MIDIMessageTypes.trackName
            );
            // Don't add the first track's name as it's not metadata, it's the name!
            if (trackName && this.tracks.indexOf(track) > 0) {
                track.name = readBinaryString(trackName.data);
                // If the track has no voice messages, its "track name" event (if it has any)
                // Is some metadata.
                // Add it to copyright
                if (
                    !trackHasVoiceMessages &&
                    !track.name.toLowerCase().includes("setup")
                ) {
                    this.extraMetadata.push(trackName);
                }
            }
        }

        // Reverse the tempo changes
        this.tempoChanges.reverse();

        SpessaLog.info(
            `%cCorrecting loops, ports and detecting notes...`,
            ConsoleColors.info
        );

        const firstNoteOns = [];
        for (const t of this.tracks) {
            const firstNoteOn = t.events.find(
                (e) => (e.statusByte & 0xf0) === MIDIMessageTypes.noteOn
            );
            if (firstNoteOn) {
                firstNoteOns.push(firstNoteOn.ticks);
            }
        }
        this.firstNoteOn = Math.min(...firstNoteOns);

        SpessaLog.info(
            `%cFirst note-on detected at: %c${this.firstNoteOn}%c ticks!`,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info
        );
        // Loop detection
        loopStart ??= this.firstNoteOn;

        if (loopEnd === null || loopEnd === 0) {
            loopEnd = this.lastVoiceEventTick;
        }

        this.loop = { start: loopStart, end: loopEnd, type: loopType };

        // Loop fix:
        // Rarely loopEnd is declared via meta, just after the last voice event, treat the loop event as voice
        // Testcase: 7. Bad Apple!! (icebhm23230 - XG).mid
        this.lastVoiceEventTick = Math.max(
            this.lastVoiceEventTick,
            this.loop.end
        );

        SpessaLog.info(
            `%cLoop points: start: %c${this.loop.start}%c end: %c${this.loop.end}`,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info,
            ConsoleColors.recognized
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
                if (e.statusByte !== MIDIMessageTypes.midiPort) {
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

        // Attempt to determine ports from track names:
        // A<num> or PartA<num>
        // B<num> or PartB<num>
        // C<num> or PartC<num>
        // D<num> or PartD<num>
        if (portOffset === 0) {
            for (const track of this.tracks) {
                const n = track.name;
                if (n.includes("PartA") || /^A\d/.test(n)) {
                    track.port = 0;
                    this.portChannelOffsetMap[0] = 0;
                    continue;
                }
                if (n.includes("PartB") || /^B\d/.test(n)) {
                    track.port = 1;
                    this.portChannelOffsetMap[1] = 16;
                    continue;
                }
                if (n.includes("PartC") || /^C\d/.test(n)) {
                    track.port = 2;
                    this.portChannelOffsetMap[2] = 32;
                    continue;
                }
                if (n.includes("PartD") || /^D\d/.test(n)) {
                    track.port = 3;
                    this.portChannelOffsetMap[3] = 48;
                }
            }
        }

        // Fix empty port channel offsets (do a copy to turn empty slots into undefined so the map goes over them)
        this.portChannelOffsetMap = [...this.portChannelOffsetMap].map(
            (o) => o ?? 0
        );

        // Fix midi ports:
        // MIDI tracks without ports will have a value of -1
        // If all ports have a value of -1, set it to 0,
        // Otherwise take the first midi port and replace all -1 with it,
        // Why would we do this?
        // Some midis (for some reason) specify all channels to port 1 or else,
        // But leave the conductor track with no port pref.
        // This spessasynth to reserve the first 16 channels for the conductor track
        // (which doesn't play anything) and use the additional 16 for the actual ports.
        let defaultPort = Infinity;
        for (const track of this.tracks) {
            if (track.port !== -1 && defaultPort > track.port) {
                defaultPort = track.port;
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
            SpessaLog.info(
                `%cNo additional MIDI Ports detected.`,
                ConsoleColors.info
            );
        } else {
            this.isMultiPort = true;
            SpessaLog.info(`%cMIDI Ports detected!`, ConsoleColors.recognized);
        }

        // MIDI name
        if (!nameDetected) {
            if (this.tracks.length > 1) {
                // If more than 1 track and the first track has no notes,
                // Just find the first trackName in the first track.
                if (
                    !this.tracks[0].events.some(
                        (message) =>
                            message.statusByte >= MIDIMessageTypes.noteOn &&
                            message.statusByte < MIDIMessageTypes.polyPressure
                    )
                ) {
                    const name = this.tracks[0].events.find(
                        (message) =>
                            message.statusByte === MIDIMessageTypes.trackName
                    );
                    if (name) {
                        this.binaryName = name.data;
                    }
                }
            } else {
                // If only 1 track, find the first "track name" event
                const name = this.tracks[0].events.find(
                    (message) =>
                        message.statusByte === MIDIMessageTypes.trackName
                );
                if (name) {
                    this.binaryName = name.data;
                }
            }
        }
        // Remove empty strings
        this.extraMetadata = this.extraMetadata.filter(
            (c) => c.data.length > 0
        );

        // Sort lyrics (https://github.com/spessasus/spessasynth_core/issues/10)
        this.lyrics.sort((a, b) => a.ticks - b.ticks);

        // If the first event is not at 0 ticks, add a track name
        // https://github.com/spessasus/SpessaSynth/issues/145
        if (!this.tracks.some((t) => t.events[0].ticks === 0)) {
            const track = this.tracks[0];
            // Can copy
            let b = this?.binaryName?.buffer as ArrayBuffer;
            if (!b) {
                b = new Uint8Array(0).buffer;
            }
            track.addEvents(
                0,
                new MIDIMessage(
                    0,
                    MIDIMessageTypes.trackName,
                    new IndexedByteArray(b)
                )
            );
        }
        this.duration = this.midiTicksToSeconds(this.lastVoiceEventTick);

        // Get sorted events
        (this.timeline as TimelineEvent[]).length = 0;
        this.iterate((_, tr, eventIndexes) => {
            // Hack to write into the readonly array (we can write to it)
            (this.timeline as TimelineEvent[]).push(
                Object.freeze({ ev: eventIndexes[tr], tr })
            );
        });

        // Invalidate raw name if empty
        if (this.binaryName?.length === 0) {
            this.binaryName = undefined;
        }

        SpessaLog.info(
            `%cMIDI file parsed. Total tick time: %c${this.lastVoiceEventTick}%c, total seconds time: %c${formatTime(Math.ceil(this.duration)).time}`,
            ConsoleColors.info,
            ConsoleColors.recognized,
            ConsoleColors.info,
            ConsoleColors.recognized
        );
        SpessaLog.groupEnd();
    }
}
