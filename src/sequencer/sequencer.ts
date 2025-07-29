import { processEventInternal } from "./process_event";
import { processTick } from "./process_tick";
import {
    assingMIDIPortInternal,
    loadNewSequenceInternal
} from "./song_control";
import { playToInternal } from "./play";
import { SpessaSynthWarn } from "../utils/loggin";

import { MIDI_CHANNEL_COUNT } from "../synthetizer/audio_engine/engine_components/synth_constants";
import { BasicMIDI } from "../midi/basic_midi";
import type { SpessaSynthProcessor } from "../synthetizer/audio_engine/processor";
import type { MIDIMessage } from "../midi/midi_message";
import { midiControllers, midiMessageTypes } from "../midi/enums";

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
    public synth: SpessaSynthProcessor;
    /**
     * If the MIDI messages should be sent to an event instead of the synth.
     * This is used by spessasynth_lib to pass them over to Web MIDI API.
     */
    public sendMIDIMessages: boolean = false;
    /**
     * The loop count of the sequencer.
     * If infinite, it will loop forever.
     */
    public loopCount: number = Infinity;
    /**
     * The length of the current sequence in seconds.
     */
    public duration: number = 0;
    /**
     * Controls if the sequencer loops (defaults to true).
     */
    public loop: boolean = true;
    /**
     * The currently loaded MIDI data.
     */
    public midiData: BasicMIDI = new BasicMIDI();
    /**
     * Indicates if the sequencer should skip to the first note on event.
     * Defaults to true.
     */
    public skipToFirstNoteOn: boolean = true;
    /**
     * Indicates if the sequencer should stay paused when seeking to a new time.
     * Defaults to false.
     */
    public preservePlaybackState: boolean = false;
    /**
     * Called when a MIDI message is sent and sendMIDIMessages is true.
     * @param message the binary MIDI message.
     */
    public onMIDIMessage?: (message: number[]) => unknown;
    /**
     * Called when the time is changed.
     * It also gets called when a song gets changed.
     * @param newTime the new time in seconds.
     */
    public onTimeChange?: (newTime: number) => unknown;
    /**
     * Called when the playback stops.
     * @param isFinished true if the playback stopped because it finished playing the song, false if it was stopped manually.
     */
    public onPlaybackStop?: (isFinished: boolean) => unknown;
    /**
     * Called when the song list is changed.
     * @param newSongList the new song list.
     * This is called when the sequencer finishes loading a new song list.
     */
    public onSongListChange?: (newSongList: BasicMIDI[]) => unknown;
    /**
     * Called when the song changes.
     * @param songIndex the index of the new song in the song list.
     * @param autoPlay true if the next song will be played automatically, false if it will not.
     */
    public onSongChange?: (songIndex: number, autoPlay: boolean) => unknown;
    /**
     * Called when a MIDI Meta event is encountered.
     * @param e the MIDI message of the meta event.
     * @param trackIndex the index of the track where the meta event was encountered.
     */
    public onMetaEvent?: (e: MIDIMessage, trackIndex: number) => unknown;
    /**
     * Called when the loop count changes (decreases).
     * @param count the new loop count.
     */
    public onLoopCountChange?: (count: number) => unknown;
    /**
     * Processes a single MIDI tick.
     * Call this every rendering quantum to process the sequencer events in real-time.
     */
    public processTick: typeof processTick = processTick.bind(
        this
    ) as typeof processTick;
    /**
     * The time of the first note in seconds.
     */
    protected firstNoteTime: number = 0;
    /**
     * How long a single MIDI tick currently lasts in seconds.
     */
    protected oneTickToSeconds: number = 0;
    /**
     * If the sequencer is currently active (playing or paused)
     * If there are no songs loaded, this is false.
     */
    protected isActive: boolean = false;
    /**
     * The current event index for each track.
     * This is used to track which event is currently being processed for each track.
     */
    protected eventIndex: number[] = [];
    /**
     * The time that has already been played in the current song.
     */
    protected playedTime: number = 0;
    /**
     * The paused time of the sequencer.
     * If the sequencer is not paused, this is undefined.
     */
    protected pausedTime: number | undefined = undefined;
    /**
     * Absolute time of the sequencer when it started playing.
     * It is based on the synth's current time.
     */
    protected absoluteStartTime: number = 0;
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
    protected midiPorts: number[] = [];
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
    protected assignMIDIPort = assingMIDIPortInternal.bind(this);
    protected loadNewSequence = loadNewSequenceInternal.bind(this);
    protected processEvent = processEventInternal.bind(this);
    protected playTo = playToInternal.bind(this);

    /**
     * Initializes a new Sequencer without any songs loaded.
     * @param spessasynthProcessor the synthesizer processor to use with this sequencer.
     */
    constructor(spessasynthProcessor: SpessaSynthProcessor) {
        this.synth = spessasynthProcessor;
        this.absoluteStartTime = this.synth.currentSynthTime;
    }

    protected _songIndex: number = 0;

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
        this.loadCurrentSong();
    }

    private _shuffleMode: boolean = false;

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
    protected _playbackRate: number = 1;

    // noinspection JSUnusedGlobalSymbols
    /**
     * The sequencer's playback rate.
     * This is the rate at which the sequencer plays back the MIDI data.
     * @param value the playback rate to set.
     */
    public set playbackRate(value: number) {
        const time = this.currentTime;
        this._playbackRate = value;
        this.currentTime = time;
    }

    /**
     * The current time of the sequencer.
     * This is the time in seconds since the sequencer started playing.
     */
    public get currentTime() {
        // return the paused time if it's set to something other than undefined
        if (this.pausedTime !== undefined) {
            return this.pausedTime;
        }

        return (
            (this.synth.currentSynthTime - this.absoluteStartTime) *
            this._playbackRate
        );
    }

    /**
     * The current time of the sequencer.
     * This is the time in seconds since the sequencer started playing.
     * @param time the time to set in seconds.
     */
    public set currentTime(time) {
        if (!this.hasSongs) {
            return;
        }
        if (time > this.duration || time < 0) {
            // time is 0
            if (this.skipToFirstNoteOn) {
                this.setTimeTicks(this.midiData.firstNoteOn - 1);
            } else {
                this.setTimeTicks(0);
            }
            return;
        }
        if (this.skipToFirstNoteOn) {
            if (time < this.firstNoteTime) {
                this.setTimeTicks(this.midiData.firstNoteOn - 1);
                return;
            }
        }
        this.stop();
        this.playingNotes = [];
        const wasPaused = this.paused && this.preservePlaybackState;
        this.pausedTime = undefined;
        this?.onTimeChange?.(time);
        if (this.midiData.duration === 0) {
            SpessaSynthWarn("No duration!");
            this?.onPlaybackStop?.(true);
            return;
        }
        this.playTo(time);
        this.recalculateStartTime(time);
        if (wasPaused) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * true if paused, false if playing or stopped
     */
    public get paused() {
        return typeof this.pausedTime === "number";
    }

    /**
     * Returns true if there are any songs loaded in the sequencer.
     */
    protected get hasSongs(): boolean {
        return this.songs.length > 0;
    }

    /**
     * Starts or resumes the playback of the sequencer.
     * If the sequencer is paused, it will resume from the paused time.
     * @param resetTime if true, the current time should be reset to 0.
     */
    public play(this: SpessaSynthSequencer, resetTime: boolean = false) {
        if (this.isActive) {
            SpessaSynthWarn("Already playing");
            return;
        }

        if (!this.hasSongs) {
            throw new Error("No songs loaded in the sequencer!");
        }

        // reset the time if necessary
        if (resetTime) {
            this.pausedTime = undefined;
            this.currentTime = 0;
            return;
        }

        if (this.currentTime >= this.duration) {
            this.pausedTime = undefined;
            this.currentTime = 0;
            return;
        }

        // unpause if paused
        if (this.paused) {
            // adjust the start time
            this.recalculateStartTime(this.pausedTime || 0);
            this.pausedTime = undefined;
        }
        if (!this.sendMIDIMessages) {
            this.playingNotes.forEach((n) => {
                this.synth.noteOn(n.channel, n.midiNote, n.velocity);
            });
        }
        this.setProcessHandler();
    }

    /**
     * Pauses the playback.
     */
    public pause(isFinished = false) {
        if (this.paused) {
            SpessaSynthWarn("Already paused");
            return;
        }
        this.pausedTime = this.currentTime;
        this.stop();
        this?.onPlaybackStop?.(isFinished);
    }

    /**
     * Switches to the next song in the song list.
     * If the song list has only one song, it will reset the current time to 0.
     */
    public nextSong() {
        if (this.songs.length === 1) {
            this.currentTime = 0;
            return;
        }
        this._songIndex++;
        this._songIndex %= this.songs.length;
        this.loadCurrentSong();
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Switches to the previous song in the song list.
     * If the song list has only one song, it will reset the current time to 0.
     */
    public previousSong() {
        if (this.songs.length === 1) {
            this.currentTime = 0;
            return;
        }
        this._songIndex--;
        if (this._songIndex < 0) {
            this._songIndex = this.songs.length - 1;
        }
        this.loadCurrentSong();
    }

    /**
     * Loads a new song list into the sequencer.
     * @param midiBuffers the list of songs to load.
     * @param autoPlay whether to automatically play the first song after loading.
     */
    public loadNewSongList(midiBuffers: BasicMIDI[], autoPlay: boolean = true) {
        /**
         * parse the MIDIs (only the array buffers, MIDI is unchanged)
         * @type {BasicMIDI[]}
         */
        this.songs = midiBuffers;
        if (this.songs.length < 1) {
            return;
        }
        this._songIndex = 0;
        if (this.songs.length > 1) {
            this.loop = false;
        }
        this.shuffleSongIndexes();
        this?.onSongListChange?.(this.songs);
        this.loadCurrentSong(autoPlay);
    }

    /**
     * Stops the playback
     */
    protected stop() {
        this.clearProcessHandler();
        // disable sustain
        for (let i = 0; i < 16; i++) {
            this.synth.controllerChange(i, midiControllers.sustainPedal, 0);
        }
        this.synth.stopAllChannels();
        if (this.sendMIDIMessages) {
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

    protected resetTimers() {
        this.playedTime = 0;
        this.eventIndex = Array(this.midiData.tracks.length).fill(0);
    }

    /**
     * @returns the index of the first to the current played time
     */
    protected findFirstEventIndex() {
        let index = 0;
        let ticks = Infinity;
        this.midiData.tracks.forEach((track, i) => {
            if (this.eventIndex[i] >= track.length) {
                return;
            }
            if (track[this.eventIndex[i]].ticks < ticks) {
                index = i;
                ticks = track[this.eventIndex[i]].ticks;
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
        if (!this.sendMIDIMessages) {
            return;
        }
        this?.onMIDIMessage?.(message);
    }

    protected sendMIDIReset() {
        if (!this.sendMIDIMessages) {
            return;
        }
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

    protected loadCurrentSong(autoPlay = true) {
        let index = this._songIndex;
        if (this._shuffleMode) {
            index = this.shuffledSongIndexes[this._songIndex];
        }
        this.loadNewSequence(this.songs[index], autoPlay);
    }

    protected setProcessHandler() {
        this.isActive = true;
    }

    protected clearProcessHandler() {
        this.isActive = false;
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
        if (!this.sendMIDIMessages) {
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
        if (!this.sendMIDIMessages) {
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
        if (!this.sendMIDIMessages) {
            return;
        }
        this.sendMIDIMessage([midiMessageTypes.pitchBend | channel, LSB, MSB]);
    }

    /**
     * Sets the time in MIDI ticks.
     * @param ticks the MIDI ticks to set the time to.
     */
    protected setTimeTicks(ticks: number) {
        if (!this.hasSongs) {
            return;
        }
        this.stop();
        this.playingNotes = [];
        this.pausedTime = undefined;
        this?.onTimeChange?.(this.midiData.MIDIticksToSeconds(ticks));
        const isNotFinished = this.playTo(0, ticks);
        this.recalculateStartTime(this.playedTime);
        if (!isNotFinished) {
            return;
        }
        this.play();
    }

    /**
     * Recalculates the absolute start time of the sequencer.
     * @param time the time in seconds to recalculate the start time for.
     */
    protected recalculateStartTime(time: number) {
        this.absoluteStartTime =
            this.synth.currentSynthTime - time / this._playbackRate;
    }
}
