import { processEventInternal } from "./process_event";
import { processTick } from "./process_tick";
import { assignMIDIPortInternal, loadNewSequenceInternal } from "./song_control";
import { setTimeToInternal } from "./play";
import { SpessaSynthWarn } from "../utils/loggin";

import { MIDI_CHANNEL_COUNT } from "../synthesizer/audio_engine/engine_components/synth_constants";
import { BasicMIDI } from "../midi/basic_midi";
import type { SpessaSynthProcessor } from "../synthesizer/processor";
import { midiControllers, midiMessageTypes } from "../midi/enums";
import type { SequencerEvent, SequencerEventData } from "./types";

export class SpessaSynthSequencer {
    /**
     * Sequencer's song list.
     */
    public songs: BasicMIDI[] = [];
    /**
     * The shuffled song indexes.
     * This is used when shuffleMode is enabled.
     */
    public shuffledSongIndexes: number[] = [];
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
     * The loop count of the sequencer.
     * If infinite, it will loop forever.
     * If zero, the loop is disabled.
     */
    public loopCount = 0;
    /**
     * Indicates if the sequencer should skip to the first note on event.
     * Defaults to true.
     */
    public skipToFirstNoteOn = true;

    /**
     * Called when the sequencer calls an event.
     * @param event The event
     */
    public onEventCall?: (event: SequencerEvent) => unknown;
    /**
     * Processes a single MIDI tick.
     * You should call this every rendering quantum to process the sequencer events in real-time.
     */
    public processTick: typeof processTick = processTick.bind(
        this
    ) as typeof processTick;
    /**
     * The time of the first note in seconds.
     */
    protected firstNoteTime = 0;
    /**
     * How long a single MIDI tick currently lasts in seconds.
     */
    protected oneTickToSeconds = 0;
    /**
     * The current event index for each track.
     * This is used to track which event is currently being processed for each track.
     */
    protected eventIndexes: number[] = [];
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
     * The time of the song at the last update point (e.g. pause, seek, rate change)
     */
    protected timeAtLastUpdate = 0;

    /**
     * The synth's time at the last update point.
     */
    protected synthTimeAtLastUpdate = 0;
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
        this.synthTimeAtLastUpdate = this.synth.currentSynthTime;
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
     * If shuffleMode is enabled, this is the index of the shuffled song list.
     */
    public get songIndex(): number {
        return this._songIndex;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * The current song index in the song list.
     * If shuffleMode is enabled, this is the index of the shuffled song list.
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
     */
    public get shuffleMode(): boolean {
        return this._shuffleMode;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Controls if the sequencer should shuffle the songs in the song list.
     * If true, the sequencer will play the songs in a random order.
     */
    public set shuffleMode(on: boolean) {
        this._shuffleMode = on;
        if (on) {
            this.shuffleSongIndexes();
            this._songIndex = 0;
            this.loadCurrentSong();
        } else {
            this._songIndex = this.shuffledSongIndexes[this._songIndex];
        }
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
        if (!this.paused) {
            // If playing, commit the time passed with the old rate
            const timeSinceLast = this.synth.currentSynthTime - this.synthTimeAtLastUpdate;
            this.timeAtLastUpdate += timeSinceLast * this._playbackRate;
            this.synthTimeAtLastUpdate = this.synth.currentSynthTime;
        }
        // If paused, the new rate will be applied on resume
        this._playbackRate = value;
    }

    /**
     * The current time of the sequencer.
     * This is the time in seconds since the sequencer started playing.
     */
    public get currentTime() {
        if (this.pausedTime !== undefined) {
            return this.pausedTime;
        }
        const timeSinceLast = this.synth.currentSynthTime - this.synthTimeAtLastUpdate;
        return this.timeAtLastUpdate + timeSinceLast * this._playbackRate;
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
        // Update the timekeeping state for the new seek position
        this.timeAtLastUpdate = time;
        this.synthTimeAtLastUpdate = this.synth.currentSynthTime;

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
            if (this._midiData.duration === 0) {
                SpessaSynthWarn("No duration!");
                this.callEvent("pause", { isFinished: true });
                return;
            }
            this.setTimeTo(time);
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
            throw new Error("No songs loaded in the sequencer!");
        }

        // Reset the time
        if (this.currentTime >= this._midiData.duration) {
            this.currentTime = 0;
        }

        // Unpause if paused
        if (this.paused) {
            // Set the start time to the current synth time, and the musical time to the paused time
            this.timeAtLastUpdate = this.pausedTime ?? 0;
            this.synthTimeAtLastUpdate = this.synth.currentSynthTime;
        }
        if (!this.externalMIDIPlayback) {
            this.playingNotes.forEach((n) => {
                this.synth.noteOn(n.channel, n.midiNote, n.velocity);
            });
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
        if (this.songs.length < 1) {
            return;
        }
        this._songIndex = 0;
        this.shuffleSongIndexes();
        this.callEvent("songListChange", { newSongList: [...this.songs] });
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
        this.callEvent("pause", { isFinished });
    }

    protected songIsFinished() {
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
        // Disable sustain
        for (let i = 0; i < 16; i++) {
            this.synth.controllerChange(i, midiControllers.sustainPedal, 0);
        }
        this.synth.stopAllChannels();
        if (this.externalMIDIPlayback) {
            for (const note of this.playingNotes) {
                this.sendMIDIMessage([
                    midiMessageTypes.noteOff | note.channel % 16,
                    note.midiNote
                ]);
            }
            for (let c = 0; c < MIDI_CHANNEL_COUNT; c++) {
                this.sendMIDICC(c, midiControllers.allNotesOff, 0);
            }
        }
    }

    /**
     * @returns the index of the first to the current played time
     */
    protected findFirstEventIndex() {
        let index = 0;
        let ticks = Infinity;
        this._midiData!.tracks.forEach((track, i) => {
            if (this.eventIndexes[i] >= track.events.length) {
                return;
            }
            const event = track.events[this.eventIndexes[i]];
            if (event.ticks < ticks) {
                index = i;
                ticks = event.ticks;
            }
        });
        return index;
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
            return;
        }
        this.callEvent("midiMessage", { message });
    }

    protected sendMIDIReset() {
        this.sendMIDIMessage([midiMessageTypes.reset]);
        for (let ch = 0; ch < MIDI_CHANNEL_COUNT; ch++) {
            this.sendMIDIMessage([
                midiMessageTypes.controllerChange | ch,
                midiControllers.allSoundOff,
                0
            ]);
            this.sendMIDIMessage([
                midiMessageTypes.controllerChange | ch,
                midiControllers.resetAllControllers,
                0
            ]);
        }
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
        this.shuffledSongIndexes = [];
        while (indexes.length > 0) {
            const index = indexes[Math.floor(Math.random() * indexes.length)];
            this.shuffledSongIndexes.push(index);
            indexes.splice(indexes.indexOf(index), 1);
        }
    }

    protected sendMIDICC(channel: number, type: number, value: number) {
        channel %= 16;
        if (!this.externalMIDIPlayback) {
            return;
        }
        this.sendMIDIMessage([
            midiMessageTypes.controllerChange | channel,
            type,
            value
        ]);
    }

    protected sendMIDIProgramChange(channel: number, program: number) {
        channel %= 16;
        if (!this.externalMIDIPlayback) {
            return;
        }
        this.sendMIDIMessage([
            midiMessageTypes.programChange | channel,
            program
        ]);
    }

    /**
     * Sets the pitch of the given channel
     * @param channel usually 0-15: the channel to change pitch
     * @param MSB SECOND byte of the MIDI pitchWheel message
     * @param LSB FIRST byte of the MIDI pitchWheel message
     */
    protected sendMIDIPitchWheel(channel: number, MSB: number, LSB: number) {
        channel %= 16;
        if (!this.externalMIDIPlayback) {
            return;
        }
        this.sendMIDIMessage([midiMessageTypes.pitchWheel | channel, LSB, MSB]);
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
        // Update timekeeping state after seeking
        this.timeAtLastUpdate = this.playedTime;
        this.synthTimeAtLastUpdate = this.synth.currentSynthTime;
        if (!isNotFinished) {
            return;
        }
    }
}
