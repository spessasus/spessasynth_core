import type { MIDIMessage } from "../midi/midi_message.ts";

/**
 * Checks if this is a XG ON system exclusive
 */
export function isXGOn(e: MIDIMessage) {
    return (
        e.messageData[0] === 0x43 && // Yamaha
        e.messageData[2] === 0x4c && // XG ON
        e.messageData[5] === 0x7e &&
        e.messageData[6] === 0x00
    );
}

/**
 * Checks if this is a GS Drum part system exclusive
 */
export function isGSDrumsOn(e: MIDIMessage) {
    return (
        e.messageData[0] === 0x41 && // roland
        e.messageData[2] === 0x42 && // GS
        e.messageData[3] === 0x12 && // GS
        e.messageData[4] === 0x40 && // system parameter
        (e.messageData[5] & 0x10) !== 0 && // part parameter
        e.messageData[6] === 0x15
    ); // drum parts
}

/**
 * Checks if this is a GS ON system exclusive
 */
export function isGSOn(e: MIDIMessage) {
    return (
        e.messageData[0] === 0x41 && // roland
        e.messageData[2] === 0x42 && // GS
        e.messageData[6] === 0x7f
    ); // Mode set
}

/**
 * Checks if this is a GM ON system exclusive
 */
export function isGMOn(e: MIDIMessage) {
    return (
        e.messageData[0] === 0x7e && // non realtime
        e.messageData[2] === 0x09 && // gm system
        e.messageData[3] === 0x01
    ); // gm1
}

/**
 * Checks if this is a GM2 ON system exclusive
 */
export function isGM2On(e: MIDIMessage) {
    return (
        e.messageData[0] === 0x7e && // non realtime
        e.messageData[2] === 0x09 && // gm system
        e.messageData[3] === 0x03
    ); // gm2
}
