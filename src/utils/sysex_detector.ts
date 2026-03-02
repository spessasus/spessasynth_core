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
        e.data[5] === 0x00 && // MODE SET or SYSTEM MODE SET
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

export function isDrumEdit(syx: Uint8Array) {
    return (
        (syx[0] === 0x41 && // Roland
            syx[2] === 0x42 && // GS
            syx[3] === 0x12 && // DT1
            syx[4] === 0x41) || // Addr1: Drum edit map
        (syx[0] === 0x43 && // Yamaha
            syx[2] === 0x4c && // XG
            syx[3] >> 4 === 3) // Drum setup
    );
}

/**
 * -1 if not change, otherwise channel number
 * @param syx
 */
export function isProgramChange(syx: Uint8Array) {
    if (
        syx[0] === 0x43 && // Yamaha
        syx[2] === 0x4c && // XG
        syx[3] === 0x08 && // Part parameter
        // Program, bank msb or lsb
        (syx[5] === 0x03 || syx[5] === 0x01 || syx[5] === 0x02)
    ) {
        // XG program change
        return syx[4];
    } else if (
        syx[0] === 0x41 && // Roland
        syx[2] === 0x42 && // GS
        syx[3] === 0x12 && // DT1
        syx[4] === 0x40 && /// Addr1
        (syx[5] & 0xf0) === 0x10 && // Patch part parameter
        syx[6] === 0x00 // TONE NUMBER
    )
        return [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 10, 11, 12, 13, 14, 15][
            syx[5] & 0xf
        ];
    else return -1;
}
export function isGSReverb(syx: Uint8Array) {
    return (
        syx[0] === 0x41 && // Roland
        syx[2] === 0x42 && // GS
        syx[3] === 0x12 && // DT1
        syx[4] === 0x40 && // Addr1
        syx[5] === 0x01 && // Addr2
        syx[6] >= 0x30 &&
        syx[6] <= 0x37 // Addr3
    );
}

export function isGSChorus(syx: Uint8Array) {
    return (
        syx[0] === 0x41 && // Roland
        syx[2] === 0x42 && // GS
        syx[3] === 0x12 && // DT1
        syx[4] === 0x40 && // Addr1
        syx[5] === 0x01 && // Addr2
        syx[6] >= 0x38 &&
        syx[6] <= 0x40 // Addr3
    );
}

export function isGSDelay(syx: Uint8Array) {
    return (
        syx[0] === 0x41 && // Roland
        syx[2] === 0x42 && // GS
        syx[3] === 0x12 && // DT1
        syx[4] === 0x40 && // Addr1
        syx[5] === 0x01 && // Addr2
        syx[6] >= 0x50 &&
        syx[6] <= 0x5a // Addr3
    );
}
