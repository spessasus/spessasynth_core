import type { BasicMIDI } from "../basic_midi";
import type { MIDIMessage } from "../midi_message";
import type { MIDITrack } from "../midi_track";
import { MIDIMessageTypes } from "../enums";

/**
 * Follows the MIDI port of every track and resolves the channel offset of its events, the same way everywhere
 * (sequencer playback and seeking, the MIDI editor, the RMIDI writer and the used programs scan).
 * Every track starts on {@link MIDITrack.port}, its first MIDI Port event.
 * The offsets come from {@link BasicMIDI.getPortOffset}: a port without notes has none.
 * @internal
 */
export class PortTracker {
    private readonly midi;
    private ports;

    /**
     * @param midi The file whose tracks are followed.
     */
    public constructor(midi: BasicMIDI) {
        this.midi = midi;
        this.ports = midi.tracks.map((t) => t.port);
    }

    /**
     * If the message is a MIDI Port event with a port number (an empty one is ignored, like when the file is parsed).
     * @param e The MIDI message.
     */
    public static isPortEvent(e: MIDIMessage) {
        return e.statusByte === MIDIMessageTypes.midiPort && e.data.length > 0;
    }

    /**
     * Walks a single track in order, following its port without tracking the other tracks.
     * @param track The track to walk.
     * @param callback Called for every event that is not a MIDI Port event, with the track's current port
     * (-1 if the track has no port). Return true to stop.
     * @returns The index of the event the callback stopped at, or -1.
     */
    public static walkTrack(
        track: MIDITrack,
        callback: (e: MIDIMessage, port: number) => boolean | undefined
    ) {
        let port = track.port;
        for (let i = 0; i < track.events.length; i++) {
            const e = track.events[i];
            if (e.statusByte === MIDIMessageTypes.midiPort) {
                if (e.data.length > 0) port = e.data[0];
                continue;
            }
            if (callback(e, port)) return i;
        }
        return -1;
    }

    /**
     * Puts every track back on its starting port, like a fresh playback.
     * Follows the current tracks, so tracks added or removed since (and flushed) are handled.
     */
    public reset() {
        this.ports = this.midi.tracks.map((t) => t.port);
    }

    /**
     * Handles a MIDI Port event, switching its track to the new port.
     * @param e The MIDI message.
     * @param track The track of the message.
     * @returns True if the message was a MIDI Port meta event (even an empty one), the caller is done with it then.
     */
    public update(e: MIDIMessage, track: number) {
        if (e.statusByte !== MIDIMessageTypes.midiPort) return false;
        if (e.data.length > 0) this.ports[track] = e.data[0];
        return true;
    }

    /**
     * The current port of a track.
     * @param track The track number.
     */
    public port(track: number) {
        return this.ports[track];
    }

    /**
     * The channel offset of a track's current port.
     * @param track The track number.
     * @returns The offset, or undefined if no notes play on that port (its messages go nowhere).
     */
    public offset(track: number) {
        return this.midi.getPortOffset(this.port(track));
    }

    /**
     * The port whose channels start at an offset, the inverse of {@link offset}.
     * @param offset The channel offset, a multiple of 16.
     * @returns The lowest port with notes that has the offset, or undefined if there is none.
     */
    public portWithOffset(offset: number) {
        const port = this.midi.portChannelOffsetMap.findIndex(
            (_, p) => this.midi.getPortOffset(p) === offset
        );
        return port === -1 ? undefined : port;
    }
}
