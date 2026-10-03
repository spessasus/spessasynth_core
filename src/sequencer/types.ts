import type { BasicMIDI } from "../midi/basic_midi";
import type { MIDIMessage } from "../midi/midi_message";

/**
 * {@link SequencerEvent} represents an event that {@link SpessaSynthSequencer} emits.
 *
 * Events can be received by specifying a {@link SpessaSynthSequencer.onEventCall} callback.
 *
 * @group Sequencer
 */
export interface SequencerEvent {
    /**
     * This event is called when a MIDI message is sent and {@link SpessaSynthSequencer.externalMIDIPlayback `externalMIDIPlayback`} is true.
     */
    midiMessage: {
        /**
         * The binary MIDI message data.
         */
        message: number[];

        /**
         * The value of {@link SpessaSynthProcessor.currentTime} when this event was sent.
         * Use this for scheduling MIDI messages to your external MIDI device.
         */
        time: number;

        /**
         * The channel offset of this message, it is useful for multi-port MIDI files.
         * For example, offset of 0 means the first 16 channels (0-15). Offset of 16 means the second port (channels 16-31).
         * The second port could be routed to a second MIDI output or a second MIDI device.
         */
        channelOffset: number;
    };
    /**
     * This event is called when {@link SpessaSynthSequencer.currentTime} is changed.
     *
     * This event also gets called when a song gets changed.
     */
    timeChange: {
        /**
         * The new time in seconds.
         */
        newTime: number;
    };

    /**
     * This event is called when the playback stops.
     */
    songEnded: object;

    /**
     * This event is called when the song changes.
     */
    songChange: {
        /**
         * The index of the new song in {@link SpessaSynthSequencer.songs}.
         */
        songIndex: number;
    };

    /**
     *  This event is called when the song list changes.
     */
    songListChange: {
        /**
         * The new song list.
         */
        newSongList: BasicMIDI[];
    };

    /**
     * This event is called when a MIDI Meta event is encountered.
     *
     * It may be useful for listening for events such as tempo change or lyric event.
     */
    metaEvent: {
        /**
         * The MIDI message of the meta event.
         */
        event: MIDIMessage;
        /**
         * The index of the track where the meta event was encountered.
         */
        trackIndex: number;
    };

    /**
     * This event is called when the loop count changes (decreases).
     */
    loopCountChange: {
        /**
         * The new loop count.
         */
        newCount: number;
    };
}

/**
 * @inheritDoc SequencerEvent
 *
 * @group Sequencer
 */
export type SequencerEventCallback = {
    [K in keyof SequencerEvent]: {
        type: K;
        data: SequencerEvent[K];
    };
}[keyof SequencerEvent];
