import { _addNewMidiPort, _processEvent } from './worklet_sequencer/process_event.js'
import { _findFirstEventIndex, _processTick } from './worklet_sequencer/process_tick.js'
import { loadNewSequence, loadNewSongList, nextSong, previousSong } from './worklet_sequencer/song_control.js'
import { _playTo, _recalculateStartTime, play, setTimeTicks } from './worklet_sequencer/play.js'
import { midiControllers } from '../midi_parser/midi_message.js'
import { SpessaSynthWarn } from '../utils/loggin.js'

class Sequencer
{
    /**
     * @param Synthesizer {Synthesizer}
     */
    constructor(Synthesizer)
    {
        this.synth = Synthesizer;
        this.ignoreEvents = false;

        // event's number in this.events
        /**
         * @type {number[]}
         */
        this.eventIndex = [];
        this.songIndex = 0;

        // tracks the time that we have already played
        /**
         * @type {number}
         */
        this.playedTime = 0;

        /**
         * The (relative) time when the sequencer was paused. If it's not paused then it's undefined.
         * @type {number}
         */
        this.pausedTime = undefined;

        /**
         * Absolute playback startTime, bases on the synth's time
         * @type {number}
         */
        this.absoluteStartTime = this.currentTime;

        /**
         * Controls the playback's rate
         * @type {number}
         */
        this._playbackRate = 1;

        /**
         * Currently playing notes (for pausing and resuming)
         * @type {{
         *     midiNote: number,
         *     channel: number,
         *     velocity: number
         * }[]}
         */
        this.playingNotes = [];

        // controls if the sequencer loops (defaults to true)
        this.loop = true;

        /**
         * the current track data
         * @type {MIDI}
         */
        this.midiData = undefined;

        /**
         * midi port number for the corresponding track
         * @type {number[]}
         */
        this.midiPorts = [];

        this.midiPortChannelOffset = 0;

        /**
         * midi port: channel offset
         * @type {Object<number, number>}
         */
        this.midiPortChannelOffsets = {};
    }

    /**
     * @param value {number}
     */
    set playbackRate(value)
    {
        const time = this.currentTime;
        this._playbackRate = value;
        this.currentTime = time;
    }

    get currentTime()
    {
        // return the paused time if it's set to something other than undefined
        if(this.pausedTime)
        {
            return this.pausedTime;
        }

        return (this.synth.currentTime - this.absoluteStartTime) * this._playbackRate;
    }

    set currentTime(time)
    {
        if(time < 0 || time > this.duration || time === 0)
        {
            // time is 0
            this.setTimeTicks(this.midiData.firstNoteOn - 1);
            return;
        }
        this.stop();
        this.playingNotes = [];
        this.pausedTime = undefined;
        const isNotFinished = this._playTo(time);
        this._recalculateStartTime(time);
        if(!isNotFinished)
        {
            return;
        }
        this.play();
    }

    /**
     * Pauses the playback
     */
    pause()
    {
        if(this.paused)
        {
            SpessaSynthWarn("Already paused");
            return;
        }
        this.pausedTime = this.currentTime;
        this.stop();
    }

    /**
     * Stops the playback
     */
    stop()
    {
        this.clearProcessHandler()
        // disable sustain
        for (let i = 0; i < 16; i++) {
            this.synth.controllerChange(i, midiControllers.sustainPedal, 0);
        }
        this.synth.stopAllChannels();
    }

    _resetTimers()
    {
        this.playedTime = 0
        this.eventIndex = Array(this.tracks.length).fill(0);
    }

    /**
     * true if paused, false if playing or stopped
     * @returns {boolean}
     */
    get paused()
    {
        return this.pausedTime !== undefined;
    }

    setProcessHandler()
    {
        this.synth.processTickCallback = this._processTick.bind(this);
    }

    clearProcessHandler()
    {
        this.synth.processTickCallback = undefined;
    }
}

Sequencer.prototype._processEvent = _processEvent;
Sequencer.prototype._addNewMidiPort = _addNewMidiPort;
Sequencer.prototype._processTick = _processTick;
Sequencer.prototype._findFirstEventIndex = _findFirstEventIndex;

Sequencer.prototype.loadNewSequence = loadNewSequence;
Sequencer.prototype.loadNewSongList = loadNewSongList;
Sequencer.prototype.nextSong = nextSong;
Sequencer.prototype.previousSong = previousSong;

Sequencer.prototype.play = play;
Sequencer.prototype._playTo = _playTo;
Sequencer.prototype.setTimeTicks = setTimeTicks;
Sequencer.prototype._recalculateStartTime = _recalculateStartTime;

export { Sequencer }