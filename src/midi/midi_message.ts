/**
 * Midi_message.ts
 * purpose: contains enums for midi events and controllers and functions to parse them
 */
import type { MIDIMessageType } from "./enums";

export class MIDIMessage {
    /**
     * Absolute number of MIDI ticks from the start of the track.
     */
    public ticks: number;

    /**
     * The MIDI message status byte. Note that for meta events, it is the second byte. (not 0xFF).
     */
    public statusByte: MIDIMessageType;

    /**
     * Message's binary data.
     */
    public data: Uint8Array<ArrayBuffer>;

    /**
     * Creates a new MIDI message.
     * @param ticks time of this message in absolute MIDI ticks.
     * @param byte the message status byte.
     * @param data the message's binary data.
     */
    public constructor(
        ticks: number,
        byte: MIDIMessageType,
        data: Uint8Array<ArrayBuffer>
    ) {
        this.ticks = ticks;
        this.statusByte = byte;
        this.data = data;
    }
}
