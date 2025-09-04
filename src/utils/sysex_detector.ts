import type { MIDIMessage } from "../midi/midi_message";

/**
 * Checks if this is a XG ON system exclusive
 */
export function isXGOn(e: MIDIMessage) {
    return (
        e.data[0] === 0x43 && // Yamaha
        e.data[2] === 0x4c && // XG ON
        e.data[5] === 0x7e &&
        e.data[6] === 0x00
    );
}

/**
 * Checks if this is a GS Drum part system exclusive
 */
export function isGSDrumsOn(e: MIDIMessage) {
    return (
        e.data[0] === 0x41 && // Roland
        e.data[2] === 0x42 && // GS
        e.data[3] === 0x12 && // GS
        e.data[4] === 0x40 && // System parameter
        (e.data[5] & 0x10) !== 0 && // Part parameter
        e.data[6] === 0x15
    ); // Drum parts
}

/**
 * Checks if this is a GS ON system exclusive
 */
export function isGSOn(e: MIDIMessage) {
    return (
        e.data[0] === 0x41 && // Roland
        e.data[2] === 0x42 && // GS
        e.data[6] === 0x7f
    ); // Mode set
}

/**
 * Checks if this is a GM ON system exclusive
 */
export function isGMOn(e: MIDIMessage) {
    return (
        e.data[0] === 0x7e && // Non realtime
        e.data[2] === 0x09 && // Gm system
        e.data[3] === 0x01
    ); // Gm1
}

/**
 * Checks if this is a GM2 ON system exclusive
 */
export function isGM2On(e: MIDIMessage) {
    return (
        e.data[0] === 0x7e && // Non realtime
        e.data[2] === 0x09 && // Gm system
        e.data[3] === 0x03
    ); // Gm2
}
