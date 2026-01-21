import { IndexedByteArray, MIDIBuilder, midiMessageTypes } from "../src";
import fs from "fs/promises";

const mid = new MIDIBuilder({
    name: "Polyphonic BEND control test",
    format: 0
});

// GS reset
mid.addEvent(
    0,
    0,
    midiMessageTypes.systemExclusive,
    new IndexedByteArray([
        0x41, // Roland
        0x10, // Device ID (defaults to 16 on roland)
        0x42, // GS
        0x12, // Command ID (DT1) (whatever that means...)
        0x40, // System parameter - Address
        0x00, // Global parameter -  Address
        0x7f, // GS Change - Address
        0x00, // Turn on - Data
        0x41, // Checksum
        0xf7 // End of exclusive
    ])
);

/**
 * Configures polyphonic aftertouch to act as a pitch wheel
 * @param channel the MIDI channel number
 * @param bendRange the pitch bend range in semitones [-24;+24]
 */
function getPolyToPitchBendMessage(channel: number, bendRange: number) {
    // The message to set poly bend control
    // 41 10 42 12 40 2c 30 xx ck F7
    // c - channel, where 0 is channel 9(!), 1 is channel 0, 2 is channel 1, etc.
    // ck - checksum
    // xx - bend range, 64 is 0, 40 is -24 semi, 88 is +24 semi

    const sysexChannel = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 10, 11, 12, 13, 14, 15][
        channel
    ];
    const chanAddress = 0x20 | sysexChannel;
    const bendBit = 64 + bendRange;

    // Calculate checksum
    // https://cdn.roland.com/assets/media/pdf/F-20_MIDI_Imple_e01_W.pdf section 4
    const sum = 0x40 + chanAddress + 0x30 + bendBit;
    const checksum = 128 - (sum % 128);

    return new Uint8Array([
        0x41, // Roland
        0x10, // Device ID (defaults to 16 on roland)
        0x42, // GS
        0x12, // Command ID (DT1) (whatever that means...)
        0x40, // System parameter - Address
        chanAddress, // Part number - Address
        0x30, // Polyphonic BEND control
        bendBit, // BEND control amount
        checksum, // Checksum,
        0xf7 // End of exclusive
    ]);
}

const sysex = getPolyToPitchBendMessage(0, 12);
mid.addEvent(60, 0, midiMessageTypes.systemExclusive, sysex);

// Square
mid.addProgramChange(120, 0, 0, 54);
mid.addNoteOn(121, 0, 0, 60, 127);
mid.addNoteOn(121, 0, 0, 64, 127);

const bendSpeed = 20;
let ticks = 240;
for (let i = 0; i < 127; i++) {
    ticks += bendSpeed;
    mid.addEvent(
        ticks,
        0,
        midiMessageTypes.polyPressure,
        new Uint8Array([60, i])
    );
}
for (let i = 0; i < 127; i++) {
    ticks += bendSpeed;
    mid.addEvent(
        ticks,
        0,
        midiMessageTypes.polyPressure,
        new Uint8Array([64, i])
    );
}

ticks += 480;

for (let i = 127; i >= 0; i--) {
    ticks += bendSpeed;
    mid.addEvent(
        ticks,
        0,
        midiMessageTypes.polyPressure,
        new Uint8Array([64, i])
    );
    mid.addEvent(
        ticks,
        0,
        midiMessageTypes.polyPressure,
        new Uint8Array([60, i])
    );
}

mid.addNoteOff(ticks + 1920, 0, 0, 60);
mid.addNoteOff(ticks + 1920, 0, 0, 64);
mid.flush();

const bin = new Uint8Array(mid.writeMIDI());

await fs.writeFile("out.mid", bin);
console.log("written to out.mid");
