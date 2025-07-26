/**
 * midi_message.js
 * purpose: contains enums for midi events and controllers and functions to parse them
 */
import type { IndexedByteArray } from "../utils/indexed_array";
import type { messageTypes } from "./enums";

export class MIDIMessage {
    /**
     * Absolute number of MIDI ticks from the start of the track.
     */
    ticks: number;

    /**
     * The MIDI message status byte. Note that for meta events, it is the second byte. (not 0xFF)
     */
    messageStatusByte: messageTypes;

    /**
     * Message's binary data
     */
    messageData: IndexedByteArray;

    /**
     * Creates a new MIDI message
     * @param ticks time of this message in absolute MIDI ticks
     * @param byte the message status byte
     * @param data the message's binary data
     */
    constructor(ticks: number, byte: messageTypes, data: IndexedByteArray) {
        this.ticks = ticks;
        this.messageStatusByte = byte;
        this.messageData = data;
    }
}

/**
 * Gets the status byte's channel
 * @param statusByte the MIDI status byte
 * @returns channel is -1 for system messages -2 for meta and -3 for sysex
 */
export function getChannel(statusByte: messageTypes): number {
    const eventType = statusByte & 0xf0;
    const channel = statusByte & 0x0f;

    let resultChannel = channel;

    switch (eventType) {
        // midi (and meta and sysex headers)
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
export function getEvent(statusByte: messageTypes): {
    channel: number;
    status: number;
} {
    const status = statusByte & 0xf0;
    const channel = statusByte & 0x0f;

    let eventChannel = -1;
    let eventStatus = statusByte;

    if (status >= 0x80 && status <= 0xe0) {
        eventChannel = channel;
        eventStatus = status as messageTypes;
    }

    return {
        status: eventStatus,
        channel: eventChannel
    };
}

export const dataBytesAmount = {
    0x8: 2, // note off
    0x9: 2, // note on
    0xa: 2, // note at
    0xb: 2, // cc change
    0xc: 1, // pg change
    0xd: 1, // channel after touch
    0xe: 2 // pitch wheel
} as const;
