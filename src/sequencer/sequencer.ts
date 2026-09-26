import { processEventInternal } from "./process_event";
import { processTick } from "./process_tick";
import {
    assignMIDIPortInternal,
    loadNewSequenceInternal
} from "./load_new_sequence";
import { setTimeToInternal } from "./set_time_to";
import { BasicMIDI } from "../midi/basic_midi";
import type { SpessaSynthProcessor } from "../synthesizer/processor";
import {
    type MIDIController,
    MIDIControllers,
    MIDIMessageTypes
} from "../midi/enums";
import type { SequencerEvent, SequencerEventCallback } from "./types";
import { arrayToHexString, ConsoleColors } from "../utils/other";
import { SpessaLog } from "../utils/loggin";
import type { SysExAcceptedArray } from "../midi/types";
import { MIDIUtils } from "../midi/exports";

/**
 * This module is responsible for playing back {@link BasicMIDI} sequences to {@link SpessaSynthProcessor}.
 *
 * @group Sequencer
 */
export class SpessaSynthSequencer {
    /**
     * Sequencer's current song list.
     */
    public songs: BasicMIDI[] = [];
    /**
     * The shuffled song indexes.
     * These will be played in order when the shuffle mode is enabled.
     */
    public readonly shuffledSongIndexes: number[] = [];
    /**
     * The synthesizer connected to the sequencer.
     */
    public readonly synth: SpessaSynthProcessor;
    /**
     * If the MIDI messages should be sent to an event instead of the synth.
     * This is used by `spessasynth_lib` to pass them over to Web MIDI API.
     *
     * If true, {@link SequencerEvent.midiMessage} will be emitted.
     */
    public externalMIDIPlayback = false;

    /**
     * If the notes that were playing when the sequencer was paused should be re-triggered.
     * This will re-trigger the notes at the same velocity when unpausing the sequencer.
     *
     * Defaults to true.
     */
    public retriggerPausedNotes = true;

    /**
     * The current loop count of the sequencer.
     * If set to `Infinity`, it will loop forever.
     * If set to `0`, the loop is disabled.
     *
     * This value will decrease with every loop.
     */
    public loopCount = 0;
    /**
     * Indicates if the sequencer should skip to the first note on event.
     * Defaults to true.
     */
    public skipToFirstNoteOn = true;

    /**
     * Indicates if the sequencer has finished playing the song list.
     */
    public isFinished = false;

    /**
     * A boolean indicating if the smart preloading should be enabled. It is highly recommended.
     * This causes the sequencer to {@link BasicMIDI.preloadSynth} all the songs when loading them (except for those with embedded sound banks).
     *
     * Defaults to true.
     */
    public preload = true;

    /**
     * This property can be defined as a function that listens for events.
     * All events are defined in {@link SequencerEvent}.
     *
     * @param event The event that occurred.
     */
    public onEventCall?: (event: SequencerEventCallback) => unknown;
    /**
     * The time of the first note in seconds.
     * @internal
     */
    protected firstNoteTime = 0;
    /**
     * How long a single MIDI tick currently lasts in seconds.
     * @internal
     */
    protected oneTickToSeconds = 0;
    /**
     * The current event index in the sorted event list.
     * This is used to track which event is currently being processed.
     * @protected
     * @internal
     */
    protected index = 0;
    /**
     * The time that has already been played in the current song.
     * @internal
     */
    protected playedTime = 0;
    /**
     * The paused time of the sequencer.
     * If the sequencer is not paused, this is undefined.
     * @internal
     */
    protected pausedTime?: number = -1;
    /**
     * Absolute time of the sequencer when it started playing.
     * It is based on the synth's current time.
     * @internal
     */
    protected absoluteStartTime = 0;
    /**
     * Currently playing notes, for pressing them after pausing.
     * Map per channel, key: velocity.
     * If the `.get()` method returns nothing then this note is not playing.
     * @internal
     */
    protected readonly playingNotes: Map<number, number>[] = [];
    /**
     * MIDI Port number for each of the MIDI tracks in the current sequence.
     * @internal
     */
    protected currentMIDIPorts: number[] = [];
    /**
     * This is used to assign new MIDI port offsets to new ports.
     * @internal
     */
    protected midiPortChannelOffset = 0;
    /**
     * Channel offsets for each MIDI port.
     * Stored as:
     * Record<midi port, channel offset>
     *     @internal
     */
    protected midiPortChannelOffsets: Record<number, number> = {};
    /** @internal */
    protected assignMIDIPort = assignMIDIPortInternal.bind(this);
    /** @internal */
    protected loadNewSequence = loadNewSequenceInternal.bind(this);
    /** @internal */
    protected processEvent = processEventInternal.bind(this);
    /** @internal */
    protected setTimeTo: typeof setTimeToInternal =
        setTimeToInternal.bind(this);

    /**
     * Initializes a new sequencer without any songs loaded.
     * @param spessasynthProcessor The synthesizer instance to use with this sequencer.
     */
    public constructor(spessasynthProcessor: SpessaSynthProcessor) {
        this.synth = spessasynthProcessor;
        this.absoluteStartTime = this.synth.currentTime;
        // Use the actual count of the synth channels (as it may have grown)
        this.playingNotes = this.synth.midiChannels.map(
            () => new Map<number, number>()
        );
        this.processTick = processTick.bind(this);
    }

    /** @internal */
    protected _midiData?: BasicMIDI;

    // noinspection JSUnusedGlobalSymbols
    /**
     * The currently loaded MIDI data.
     */
    public get midiData() {
        return this._midiData;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * The length of the current sequence in seconds.
     */
    public get duration() {
        return this._midiData?.duration ?? 0;
    }

    /** @internal */
    protected _songIndex = 0;

    // noinspection JSUnusedGlobalSymbols
    /**
     * The current song index in the song list.
     * If shuffle mode is enabled, this is the index of the shuffled song list.
     *
     * This field can be set to trigger a change.
     */
    public get songIndex(): number {
        return this._songIndex;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * The current song index in the song list.
     * If shuffle mode is enabled, this is the index of the shuffled song list.
     *
     * This field can be set to trigger a change.
     */
    public set songIndex(value: number) {
        this._songIndex = value;
        this._songIndex = Math.max(0, value % this.songs.length);
        this.loadCurrentSong();
    }

    /** @internal */
    protected _shuffleMode = false;

    // noinspection JSUnusedGlobalSymbols
    /**
     * Controls if the sequencer should shuffle the songs in the song list.
     * If true, the sequencer will play the songs in a random order.
     * Songs are shuffled on a {@link SpessaSynthSequencer.loadNewSongList `loadNewSongList`} call.
     */
    public get shuffleMode(): boolean {
        return this._shuffleMode;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Controls if the sequencer should shuffle the songs in the song list.
     * If true, the sequencer will play the songs in a random order.
     * Songs are shuffled on a {@link SpessaSynthSequencer.loadNewSongList `loadNewSongList`}  call.
     */
    public set shuffleMode(on: boolean) {
        this._shuffleMode = on;
    }

    /**
     * Internal playback rate.
     * @internal
     */
    protected _playbackRate = 1;

    // noinspection JSUnusedGlobalSymbols
    /**
     * The sequencer's playback rate.
     * This is the rate at which the sequencer plays back the MIDI data.
     *
     * This field can be set to trigger a change.
     */
    public get playbackRate() {
        return this._playbackRate;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * The sequencer's playback rate.
     * This is the rate at which the sequencer plays back the MIDI data.
     *
     * This field can be set to trigger a change.
     * @param value the playback rate to set.
     */
    public set playbackRate(value: number) {
        const t = this.currentTime;
        this._playbackRate = value;
        this.recalculateStartTime(t);
    }

    /**
     * The current time of the sequencer.
     * This is the time in seconds since the sequencer started playing.
     *
     * This field can be set to trigger a change.
     */
    public get currentTime() {
        // Return the paused time if it's set to something other than undefined
        if (this.pausedTime !== undefined) {
            return this.pausedTime;
        }

        return (
            (this.synth.currentTime - this.absoluteStartTime) *
            this._playbackRate
        );
    }

    /**
     * The current time of the sequencer.
     * This is the time in seconds since the sequencer started playing.
     *
     * This field can be set to trigger a change.
     * @param time the time to set in seconds.
     */
    public set currentTime(time) {
        if (!this._midiData) {
            return;
        }
        if (this.paused) {
            this.pausedTime = time;
        }
        if (time > this._midiData.duration || time < 0) {
            // Time is 0
            if (this.skipToFirstNoteOn) {
                this.setTimeTicks(this._midiData.firstNoteOn - 1);
            } else {
                this.setTimeTicks(0);
            }
        } else if (this.skipToFirstNoteOn && time < this.firstNoteTime) {
            this.setTimeTicks(this._midiData.firstNoteOn - 1);
            return;
        } else {
            for (const ch of this.playingNotes) ch.clear();
            this.callEvent("timeChange", { newTime: time });
            this.setTimeTo(time);
            this.recalculateStartTime(time);
        }
    }

    /**
     * A boolean indicating if the sequencer is currently paused.
     */
    public get paused() {
        return this.pausedTime !== undefined;
    }

    /**
     * Processes all messages at the current time.
     * Call this every rendering quantum to process the sequencer events in real-time.
     *
     * @example
     * ```ts
     * while (filledSamples < sampleCount) {
     *     // Process sequencer
     *     seq.processTick();
     *     // Render
     *     const bufferSize = Math.min(BUFFER_SIZE, sampleCount - filledSamples);
     *     synth.process(outLeft, outRight, filledSamples, bufferSize);
     *     filledSamples += bufferSize;
     * }
     * ```
     */
    public processTick() {
        // Patched in constructor.
    }

    /**
     * Starts or resumes the playback of the sequencer.
     * If the sequencer is paused, it will resume from the paused time.
     */
    public play() {
        if (!this._midiData) {
            SpessaLog.warn(
                "No songs loaded in the sequencer. Ignoring the play call."
            );
            return;
        }

        // Reset the time
        if (this.currentTime >= this._midiData.duration) {
            this.currentTime = 0;
        }

        // Unpause if paused
        if (this.paused) {
            // Adjust the start time
            this.recalculateStartTime(this.pausedTime ?? 0);
        }
        // Do not retrigger if external playback is enabled since we're not tracking notes there
        if (this.retriggerPausedNotes && !this.externalMIDIPlayback) {
            for (
                let channel = 0;
                channel < this.playingNotes.length;
                channel++
            ) {
                const ch = this.playingNotes[channel];
                for (const [midiNote, velocity] of ch) {
                    this.sendMIDINoteOn(channel, midiNote, velocity);
                }
            }
        }
        this.pausedTime = undefined;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Pauses the playback.
     */
    public pause() {
        this.pauseInternal(false);
    }

    /**
     * Loads a new song list into the sequencer.
     * @param midiBuffers The list of songs to load.
     */
    public loadNewSongList(midiBuffers: BasicMIDI[]) {
        /**
         * Parse the MIDIs (only the array buffers, MIDI is unchanged)
         */
        this.songs = midiBuffers;
        if (this.songs.length === 0) {
            return;
        }
        this._songIndex = 0;
        this.shuffleSongIndexes();
        this.callEvent("songListChange", { newSongList: [...this.songs] });
        // Preload all songs (without embedded sound banks)
        if (this.preload) {
            SpessaLog.group("%cPreloading all songs...", ConsoleColors.info);
            for (const song of this.songs) {
                if (song.embeddedSoundBank === undefined) {
                    song.preloadSynth(this.synth);
                }
            }
            SpessaLog.groupEnd();
        }

        this.loadCurrentSong();
    }

    /** @internal */
    protected callEvent<K extends keyof SequencerEvent>(
        type: K,
        data: SequencerEvent[K]
    ) {
        this?.onEventCall?.({
            type,
            data
        } as SequencerEventCallback);
    }

    /** @internal */
    protected pauseInternal(isFinished: boolean) {
        if (this.paused) {
            return;
        }
        this.stop();
        if (isFinished) {
            this.callEvent("songEnded", {});
        }
    }

    /** @internal */
    protected songIsFinished() {
        this.isFinished = true;
        if (this.songs.length === 1) {
            this.pauseInternal(true);
            return;
        }
        this._songIndex++;
        this._songIndex %= this.songs.length;
        this.loadCurrentSong();
    }

    /**
     * Stops the playback
     * @internal
     */
    protected stop() {
        this.pausedTime = this.currentTime;
        this.sendMIDIAllOff();
    }

    /**
     * Adds a new port (16 channels) to the synth.
     * @internal
     */
    protected addNewMIDIPort() {
        for (let i = 0; i < 16; i++) {
            this.synth.createMIDIChannel();
            this.playingNotes.push(new Map<number, number>());
        }
    }

    /** @internal */
    protected sendMIDIMessage(message: number[], channelOffset: number) {
        if (!this.externalMIDIPlayback) {
            SpessaLog.warn(
                `Attempting to send ${arrayToHexString(message)} to the synthesizer via sendMIDIMessage. This shouldn't happen!`
            );
            return;
        }
        this.callEvent("midiMessage", {
            message,
            time: this.synth.currentTime,
            channelOffset
        });
    }

    /** @internal */
    protected sendMIDIAllOff() {
        // Disable sustain
        for (let i = 0; i < 16; i++) {
            this.sendMIDICC(i, MIDIControllers.sustainPedal, 0);
        }
        if (!this.externalMIDIPlayback) {
            this.synth.stopAllChannels();
            return;
        }
        // External
        // Off all playing notes
        for (let channel = 0; channel < this.playingNotes.length; channel++) {
            const ch = this.playingNotes[channel];
            for (const midiNote of ch.keys())
                this.sendMIDINoteOff(channel, midiNote);
        }

        // Send off controllers
        for (let c = 0; c < 16; c++) {
            this.sendMIDICC(c, MIDIControllers.allNotesOff, 0);
        }
    }

    /** @internal */
    protected sendMIDIReset() {
        this.sendMIDIAllOff();
        if (!this.externalMIDIPlayback) {
            this.synth.reset();
            return;
        }
        this.sendMIDISysEx(
            MIDIUtils.gs(
                0x40, // System parameter - Address
                0x00, // Global mode parameter -  Address
                0x7f, // MODE SET - Address
                [0x00] // 00 = GS Reset - Data
            )
        );
    }

    /** @internal */
    protected loadCurrentSong() {
        let index = this._songIndex;
        if (this._shuffleMode) {
            index = this.shuffledSongIndexes[this._songIndex];
        }
        this.loadNewSequence(this.songs[index]);
    }

    /** @internal */
    protected shuffleSongIndexes() {
        const indexes = this.songs.map((_, i) => i);
        this.shuffledSongIndexes.length = 0;
        while (indexes.length > 0) {
            const index = indexes[Math.floor(Math.random() * indexes.length)];
            this.shuffledSongIndexes.push(index);
            indexes.splice(indexes.indexOf(index), 1);
        }
    }

    /**
     * Sets the time in MIDI ticks.
     * @param ticks the MIDI ticks to set the time to.
     * @internal
     */
    protected setTimeTicks(ticks: number) {
        if (!this._midiData) {
            return;
        }
        for (const ch of this.playingNotes) ch.clear();
        const seconds = this._midiData.midiTicksToSeconds(ticks);
        this.callEvent("timeChange", { newTime: seconds });
        const isNotFinished = this.setTimeTo(0, ticks);
        this.recalculateStartTime(this.playedTime);
        if (!isNotFinished) {
            return;
        }
    }

    /**
     * Recalculates the absolute start time of the sequencer.
     * @param time the time in seconds to recalculate the start time for.
     * @internal
     */
    protected recalculateStartTime(time: number) {
        this.absoluteStartTime =
            this.synth.currentTime - time / this._playbackRate;
    }

    /**
     * Jumps to a MIDI tick without any further processing.
     * @param targetTicks The MIDI tick to jump to.
     * @protected
     * @internal
     */
    protected jumpToTick(targetTicks: number) {
        if (!this._midiData) {
            return;
        }
        this.sendMIDIAllOff();
        const m = this._midiData;
        const seconds = m.midiTicksToSeconds(targetTicks);
        this.callEvent("timeChange", { newTime: seconds });

        // Recalculate time and reset indexes
        this.recalculateStartTime(seconds);
        this.playedTime = seconds;
        const idx = m.timeline.findIndex(
            (e) => m.tracks[e.tr].events[e.ev].ticks >= targetTicks
        );
        // Not length - 1 since we want to mark the track as finished
        this.index = idx === -1 ? m.timeline.length : idx;

        // Correct tempo
        // Some softy-looped files (example: th06_06.mid) have slightly mismatched tempos
        const targetTempo = m.tempoChanges.find((t) => t.ticks <= targetTicks)!;
        this.oneTickToSeconds = 60 / (targetTempo.tempo * m.timeDivision);
    }

    /*
    SEND MIDI METHOD ABSTRACTIONS
    These abstract the difference between spessasynth and external MIDI
     */
    /** @internal */
    protected sendMIDINoteOn(
        channel: number,
        midiNote: number,
        velocity: number
    ) {
        if (!this.externalMIDIPlayback) {
            this.synth.noteOn(channel, midiNote, velocity);
            return;
        }
        const midiChannel = channel % 16;
        this.sendMIDIMessage(
            [MIDIMessageTypes.noteOn | midiChannel, midiNote, velocity],
            channel - midiChannel
        );
    }

    /** @internal */
    protected sendMIDINoteOff(channel: number, midiNote: number) {
        if (!this.externalMIDIPlayback) {
            this.synth.noteOff(channel, midiNote);
            return;
        }
        const midiChannel = channel % 16;
        this.sendMIDIMessage(
            [
                MIDIMessageTypes.noteOff | midiChannel,
                midiNote,
                64 // Make sure to send velocity as well
            ],
            channel - midiChannel
        );
    }

    /** @internal */
    protected sendMIDICC(channel: number, type: MIDIController, value: number) {
        if (!this.externalMIDIPlayback) {
            this.synth.controllerChange(channel, type, value);
            return;
        }
        const midiChannel = channel % 16;
        this.sendMIDIMessage(
            [MIDIMessageTypes.controllerChange | midiChannel, type, value],
            channel - midiChannel
        );
    }

    /** @internal */
    protected sendMIDISysEx(syx: SysExAcceptedArray) {
        if (!this.externalMIDIPlayback) {
            this.synth.systemExclusive(syx);
            return;
        }
        this.sendMIDIMessage([MIDIMessageTypes.systemExclusive, ...syx], 0);
    }

    /**
     * Sets the pitch of the given channel
     * @param channel usually 0-15: the channel to change pitch
     * @param pitch the 14-bit pitch value
     * @internal
     */
    protected sendMIDIPitchWheel(channel: number, pitch: number) {
        if (!this.externalMIDIPlayback) {
            this.synth.pitchWheel(channel, pitch);
            return;
        }
        const midiChannel = channel % 16;
        this.sendMIDIMessage(
            [
                MIDIMessageTypes.pitchWheel | midiChannel,
                pitch & 0x7f,
                pitch >> 7
            ],
            channel - midiChannel
        );
    }
}
