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
     * The MIDI message status byte. Note that for meta events, it is the second byte. (not 0xFF)
     */
    public statusByte: MIDIMessageType;

    /**
     * Message's binary data
     */
    public data: Uint8Array<ArrayBuffer>;

    /**
     * Creates a new MIDI message
     * @param ticks time of this message in absolute MIDI ticks
     * @param byte the message status byte
     * @param data the message's binary data
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

/**
 * Gets the status byte's channel
 * @param statusByte the MIDI status byte
 * @returns channel is -1 for system messages -2 for meta and -3 for sysex
 */
export function getChannel(statusByte: MIDIMessageType): number {
    const eventType = statusByte & 0xf0;
    const channel = statusByte & 0x0f;

    let resultChannel = channel;

    switch (eventType) {
        // Midi (and meta and sysex headers)
        case 0x80:
        case 0x90:
        case 0xa0:
        case 0xb0:
        case 0xc0:
        case 0xd0:
        case 0xe0:
            break;

        case 0xf0:
            switch (channel) {
                case 0x0:
                    resultChannel = -3;
                    break;

                case 0x1:
                case 0x2:
                case 0x3:
                case 0x4:
                case 0x5:
                case 0x6:
                case 0x7:
                case 0x8:
                case 0x9:
                case 0xa:
                case 0xb:
                case 0xc:
                case 0xd:
                case 0xe:
                    resultChannel = -1;
                    break;

                case 0xf:
                    resultChannel = -2;
                    break;
            }
            break;

        default:
            resultChannel = -1;
    }

    return resultChannel;
}

/**
 * Gets the event's status and channel from the status byte
 * @param statusByte the status byte
 * @returns channel will be -1 for sysex and meta
 */
export function getEvent(statusByte: MIDIMessageType): {
    channel: number;
    status: number;
} {
    const status = statusByte & 0xf0;
    const channel = statusByte & 0x0f;

    let eventChannel = -1;
    let eventStatus = statusByte;

    if (status >= 0x80 && status <= 0xe0) {
        eventChannel = channel;
        eventStatus = status as MIDIMessageType;
    }

    return {
        status: eventStatus,
        channel: eventChannel
    };
}

export const dataBytesAmount = {
    0x8: 2, // Note off
    0x9: 2, // Note on
    0xa: 2, // Note at
    0xb: 2, // Cc change
    0xc: 1, // Pg change
    0xd: 1, // Channel after touch
    0xe: 2 // Pitch wheel
} as const;
