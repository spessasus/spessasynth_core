import {
    IndexedByteArray,
    MIDIBuilder,
    MIDIControllers,
    MIDIMessageTypes
} from "../src";
import fs from "node:fs/promises";

const builder = new MIDIBuilder({
    name: "GS Chorus Rate Test"
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

let ticks = 480;

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

// Chorus3
sendAddress(0x40, 0x01, 0x38, 2);
// Feedback
sendAddress(0x40, 0x01, 0x3b, 0);
// Delay
sendAddress(0x40, 0x01, 0x3c, 0);
// Depth
sendAddress(0x40, 0x01, 0x3e, 127);

builder.controllerChange(ticks, 0, 0, MIDIControllers.reverbDepth, 0);
builder.controllerChange(ticks, 0, 0, MIDIControllers.chorusDepth, 127);

// SC-55 MAP sine wave
builder.controllerChange(ticks, 0, 0, MIDIControllers.bankSelectLSB, 1);
builder.controllerChange(ticks, 0, 0, MIDIControllers.bankSelect, 1);
builder.programChange(ticks, 0, 0, 80);

let level = 0;
while (level <= 128) {
    // Rate
    sendAddress(0x40, 0x01, 0x3d, Math.min(127, level));
    ticks += 80;
    builder.noteOn(ticks, 0, 0, 60, 120);
    ticks += 960;
    builder.noteOff(ticks, 0, 0, 60);
    level += 1;
}

builder.flush();
void fs.writeFile(
    "files/test_gs_chorus_rate.mid",
    new Uint8Array(builder.writeMIDI())
);
