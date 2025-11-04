import type { BasicMIDI } from "../midi/basic_midi";
import type { MIDIMessage } from "../midi/midi_message";

export interface SequencerEventData {
    /**
     * Called when a MIDI message is sent and externalMIDIPlayback is true.
     */
    midiMessage: {
        /**
         * The binary MIDI message.
         */
        message: Iterable<number>;

        /**
         * The synthesizer's current time when this event was sent.
         * Use this for scheduling MIDI messages to your external MIDI device.
         */
        time: number;
    };
    /**
     * Called when the time is changed.
     * It also gets called when a song gets changed.
     */
    timeChange: {
        /**
         * The new time in seconds.
         */
        newTime: number;
    };

    /**
     * Called when the playback stops.
     * @deprecated use songEnded instead.
     */
    pause: {
        /**
         * True if the playback stopped because it finished playing the song, false if it was stopped manually.
         */
        isFinished: boolean;
    };

    /**
     * Called when the playback stops.
     */
    songEnded: object;

    /**
     * Called when the song changes.
     */
    songChange: {
        /**
         * The index of the new song in the song list.
         */
        songIndex: number;
    };

    /**
     * Called when the song list changes.
     */
    songListChange: {
        /**
         * The new song list.
         */
        newSongList: BasicMIDI[];
    };

    /**
     * Called when a MIDI Meta event is encountered.
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
     * Called when the loop count changes (decreases).
     */
    loopCountChange: {
        /**
         * The new loop count.
         */
        newCount: number;
    };
}

export type SequencerEvent = {
    [K in keyof SequencerEventData]: {
        type: K;
        data: SequencerEventData[K];
    };
}[keyof SequencerEventData];
