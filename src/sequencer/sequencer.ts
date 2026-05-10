import { processEventInternal } from "./process_event";
import { processTick } from "./process_tick";
import {
    assignMIDIPortInternal,
    loadNewSequenceInternal
} from "./song_control";
import { setTimeToInternal } from "./set_time_to";
import { BasicMIDI } from "../midi/basic_midi";
import type { SpessaSynthProcessor } from "../synthesizer/processor";
import {
    type MIDIController,
    MIDIControllers,
    MIDIMessageTypes
} from "../midi/enums";
import type { SequencerEvent, SequencerEventData } from "./types";
import { arrayToHexString, ConsoleColors } from "../utils/other";
import { SpessaLog } from "../utils/loggin";

export class SpessaSynthSequencer {
    /**
     * Sequencer's song list.
     */
    public songs: BasicMIDI[] = [];
    /**
     * The shuffled song indexes.
     * This is used when shuffle mode is enabled.
     */
    public readonly shuffledSongIndexes: number[] = [];
    /**
     * The synthesizer connected to the sequencer.
     */
    public readonly synth: SpessaSynthProcessor;
    /**
     * If the MIDI messages should be sent to an event instead of the synth.
     * This is used by spessasynth_lib to pass them over to Web MIDI API.
     */
    public externalMIDIPlayback = false;

    /**
     * If the notes that were playing when the sequencer was paused should be re-triggered.
     * Defaults to true.
     */
    public retriggerPausedNotes = true;

    /**
     * The loop count of the sequencer.
     * If set to Infinity, it will loop forever.
     * If set to zero, the loop is disabled.
     */
    public loopCount = 0;
    /**
     * Indicates if the sequencer should skip to the first note on event.
     * Defaults to true.
     */
    public skipToFirstNoteOn = true;

    /**
     * Indicates if the sequencer has finished playing.
     */
    public isFinished = false;

    /**
     * Indicates if the synthesizer should preload the voices for the newly loaded sequence.
     * Recommended.
     */
    public preload = true;

    /**
     * Called when the sequencer calls an event.
     * @param event The event
     */
    public onEventCall?: (event: SequencerEvent) => unknown;
    /**
     * Processes a single MIDI tick.
     * You should call this every rendering quantum to process the sequencer events in real-time.
     */
    public processTick: typeof processTick = processTick.bind(this);
    /**
     * The time of the first note in seconds.
     */
    protected firstNoteTime = 0;
    /**
     * How long a single MIDI tick currently lasts in seconds.
     */
    protected oneTickToSeconds = 0;

    /**
     * The current event index in the sorted event list.
     * This is used to track which event is currently being processed.
     * @protected
     */
    protected index = 0;
    /**
     * The time that has already been played in the current song.
     */
    protected playedTime = 0;
    /**
     * The paused time of the sequencer.
     * If the sequencer is not paused, this is undefined.
     */
    protected pausedTime?: number = -1;
    /**
     * Absolute time of the sequencer when it started playing.
     * It is based on the synth's current time.
     */
    protected absoluteStartTime = 0;
    /**
     * Currently playing notes (for pausing and resuming)
     */
    protected playingNotes: {
        midiNote: number;
        channel: number;
        velocity: number;
    }[] = [];
    /**
     * MIDI Port number for each of the MIDI tracks in the current sequence.
     */
    protected currentMIDIPorts: number[] = [];
    /**
     * This is used to assign new MIDI port offsets to new ports.
     */
    protected midiPortChannelOffset = 0;
    /**
     * Channel offsets for each MIDI port.
     * Stored as:
     * Record<midi port, channel offset>
     */
    protected midiPortChannelOffsets: Record<number, number> = {};
    protected assignMIDIPort = assignMIDIPortInternal.bind(this);
    protected loadNewSequence = loadNewSequenceInternal.bind(this);
    protected processEvent = processEventInternal.bind(this);
    protected setTimeTo: typeof setTimeToInternal =
        setTimeToInternal.bind(this);

    /**
     * Initializes a new Sequencer without any songs loaded.
     * @param spessasynthProcessor the synthesizer processor to use with this sequencer.
     */
    public constructor(spessasynthProcessor: SpessaSynthProcessor) {
        this.synth = spessasynthProcessor;
        this.absoluteStartTime = this.synth.currentTime;
    }

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

    protected _songIndex = 0;

    // noinspection JSUnusedGlobalSymbols
    /**
     * The current song index in the song list.
     * If shuffle mode is enabled, this is the index of the shuffled song list.
     */
    public get songIndex(): number {
        return this._songIndex;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * The current song index in the song list.
     * If shuffle mode is enabled, this is the index of the shuffled song list.
     */
    public set songIndex(value: number) {
        this._songIndex = value;
        this._songIndex = Math.max(0, value % this.songs.length);
        this.loadCurrentSong();
    }

    protected _shuffleMode = false;

    // noinspection JSUnusedGlobalSymbols
    /**
     * Controls if the sequencer should shuffle the songs in the song list.
     * If true, the sequencer will play the songs in a random order.
     * Songs are shuffled on a `loadNewSongList` call.
     */
    public get shuffleMode(): boolean {
        return this._shuffleMode;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Controls if the sequencer should shuffle the songs in the song list.
     * If true, the sequencer will play the songs in a random order.
     * Songs are shuffled on a `loadNewSongList` call.
     */
    public set shuffleMode(on: boolean) {
        this._shuffleMode = on;
    }

    /**
     * Internal playback rate.
     */
    protected _playbackRate = 1;

    // noinspection JSUnusedGlobalSymbols
    /**
     * The sequencer's playback rate.
     * This is the rate at which the sequencer plays back the MIDI data.
     */
    public get playbackRate() {
        return this._playbackRate;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * The sequencer's playback rate.
     * This is the rate at which the sequencer plays back the MIDI data.
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
            this.playingNotes = [];
            this.callEvent("timeChange", { newTime: time });
            this.setTimeTo(time);
            this.recalculateStartTime(time);
        }
    }

    /**
     * True if paused, false if playing or stopped
     */
    public get paused() {
        return this.pausedTime !== undefined;
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
        if (this.retriggerPausedNotes) {
            for (const n of this.playingNotes) {
                this.sendMIDINoteOn(n.channel, n.midiNote, n.velocity);
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
     * @param midiBuffers the list of songs to load.
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

    protected callEvent<K extends keyof SequencerEventData>(
        type: K,
        data: SequencerEventData[K]
    ) {
        this?.onEventCall?.({
            type,
            data
        } as SequencerEvent);
    }

    protected pauseInternal(isFinished: boolean) {
        if (this.paused) {
            return;
        }
        this.stop();
        // Remove in next breaking release
        this.callEvent("pause", { isFinished });
        if (isFinished) {
            this.callEvent("songEnded", {});
        }
    }

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
     */
    protected stop() {
        this.pausedTime = this.currentTime;
        this.sendMIDIAllOff();
    }

    /**
     * Adds a new port (16 channels) to the synth.
     */
    protected addNewMIDIPort() {
        for (let i = 0; i < 16; i++) {
            this.synth.createMIDIChannel();
        }
    }

    protected sendMIDIMessage(message: number[]) {
        if (!this.externalMIDIPlayback) {
            SpessaLog.warn(
                `Attempting to send ${arrayToHexString(message)} to the synthesizer via sendMIDIMessage. This shouldn't happen!`
            );
            return;
        }
        this.callEvent("midiMessage", {
            message,
            time: this.synth.currentTime
        });
    }

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
        for (const note of this.playingNotes) {
            this.sendMIDINoteOff(note.channel, note.midiNote);
        }
        // Send off controllers
        for (let c = 0; c < 16; c++) {
            this.sendMIDICC(c, MIDIControllers.allNotesOff, 0);
            this.sendMIDICC(c, MIDIControllers.allSoundOff, 0);
        }
    }

    protected sendMIDIReset() {
        this.sendMIDIAllOff();
        if (!this.externalMIDIPlayback) {
            this.synth.resetAllControllers();
            return;
        }
        this.sendMIDIMessage([MIDIMessageTypes.reset]);
    }

    protected loadCurrentSong() {
        let index = this._songIndex;
        if (this._shuffleMode) {
            index = this.shuffledSongIndexes[this._songIndex];
        }
        this.loadNewSequence(this.songs[index]);
    }

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
     */
    protected setTimeTicks(ticks: number) {
        if (!this._midiData) {
            return;
        }
        this.playingNotes = [];
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
     */
    protected recalculateStartTime(time: number) {
        this.absoluteStartTime =
            this.synth.currentTime - time / this._playbackRate;
    }

    /**
     * Jumps to a MIDI tick without any further processing.
     * @param targetTicks The MIDI tick to jump to.
     * @protected
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
    protected sendMIDINoteOn(
        channel: number,
        midiNote: number,
        velocity: number
    ) {
        if (!this.externalMIDIPlayback) {
            this.synth.noteOn(channel, midiNote, velocity);
            return;
        }
        channel %= 16;
        this.sendMIDIMessage([
            MIDIMessageTypes.noteOn | channel,
            midiNote,
            velocity
        ]);
    }

    protected sendMIDINoteOff(channel: number, midiNote: number) {
        if (!this.externalMIDIPlayback) {
            this.synth.noteOff(channel, midiNote);
            return;
        }
        channel %= 16;
        this.sendMIDIMessage([
            MIDIMessageTypes.noteOff | channel,
            midiNote,
            64 // Make sure to send velocity as well
        ]);
    }

    protected sendMIDICC(channel: number, type: MIDIController, value: number) {
        if (!this.externalMIDIPlayback) {
            this.synth.controllerChange(channel, type, value);
            return;
        }
        channel %= 16;
        this.sendMIDIMessage([
            MIDIMessageTypes.controllerChange | channel,
            type,
            value
        ]);
    }

    /**
     * Sets the pitch of the given channel
     * @param channel usually 0-15: the channel to change pitch
     * @param pitch the 14-bit pitch value
     */
    protected sendMIDIPitchWheel(channel: number, pitch: number) {
        if (!this.externalMIDIPlayback) {
            this.synth.pitchWheel(channel, pitch);
            return;
        }
        channel %= 16;
        this.sendMIDIMessage([
            MIDIMessageTypes.pitchWheel | channel,
            pitch & 0x7f,
            pitch >> 7
        ]);
    }
}
