import {
    IndexedByteArray,
    MIDIBuilder,
    MIDIControllers,
    MIDIMessageTypes
} from "../src";
import fs from "node:fs/promises";

const builder = new MIDIBuilder({
    name: "GS Drum Pitch Test"
});

builder.addEvent(
    0,
    0,
    MIDIMessageTypes.systemExclusive,
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

let ticks = 780;

function sendAddress(a1: number, a2: number, a3: number, data: number) {
    // Calculate checksum
    // https://cdn.roland.com/assets/media/pdf/F-20_MIDI_Imple_e01_W.pdf section 4
    const sum = a1 + a2 + a3 + data;
    const checksum = (128 - (sum % 128)) & 0x7f;
    builder.addEvent(
        ticks,
        0,
        MIDIMessageTypes.systemExclusive,
        new IndexedByteArray([
            0x41, // Roland
            0x10, // Device ID (defaults to 16 on roland)
            0x42, // GS
            0x12, // Command ID (DT1) (whatever that means...)
            a1,
            a2,
            a3,
            data,
            checksum,
            0xf7 // End of exclusive
        ])
    );
}

builder.controllerChange(ticks, 0, 9, MIDIControllers.reverbDepth, 0);
// SC-55 MAP standard
builder.controllerChange(ticks, 0, 9, MIDIControllers.bankSelectLSB, 1);
builder.programChange(ticks, 0, 9, 0);

let pitch = 40;
while (pitch <= 70) {
    // Rate
    sendAddress(0x41, 0x01, 38, Math.min(127, pitch));
    ticks += 240;
    builder.noteOn(ticks, 0, 9, 38, 120);
    ticks += 80;
    builder.noteOff(ticks, 0, 9, 38);
    pitch += 1;
}

ticks += 480;

// SC-88 MAP ROOM
builder.controllerChange(ticks, 0, 9, MIDIControllers.bankSelectLSB, 3);
builder.programChange(ticks, 0, 9, 8);

ticks += 480;

pitch = 40;
while (pitch <= 70) {
    // Rate
    sendAddress(0x41, 0x01, 38, Math.min(127, pitch));
    ticks += 240;
    builder.noteOn(ticks, 0, 9, 38, 120);
    ticks += 80;
    builder.noteOff(ticks, 0, 9, 38);
    pitch += 1;
}

builder.flush();
void fs.writeFile(
    "files/test_gs_drum_pitch.mid",
    new Uint8Array(builder.writeMIDI())
);
