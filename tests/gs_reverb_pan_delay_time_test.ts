import {
    IndexedByteArray,
    MIDIBuilder,
    midiControllers,
    midiMessageTypes
} from "../src";
import fs from "fs/promises";

const builder = new MIDIBuilder({
    name: "GS Reverb Delay Time test"
});

builder.addEvent(
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

let ticks = 480;

function sendAddress(a1: number, a2: number, a3: number, data: number) {
    // Calculate checksum
    // https://cdn.roland.com/assets/media/pdf/F-20_MIDI_Imple_e01_W.pdf section 4
    const sum = a1 + a2 + a3 + data;
    const checksum = (128 - (sum % 128)) & 0x7f;
    builder.addEvent(
        ticks,
        0,
        midiMessageTypes.systemExclusive,
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

// Panning delay
sendAddress(0x40, 0x01, 0x30, 7);
// Level
sendAddress(0x40, 0x01, 0x33, 127);
// Delay feedback
sendAddress(0x40, 0x01, 0x35, 0);

builder.addControllerChange(ticks, 0, 0, midiControllers.bankSelect, 8);
builder.addProgramChange(ticks, 0, 0, 80);
builder.addControllerChange(ticks, 0, 0, midiControllers.reverbDepth, 127);

let time = 0;
while (time <= 128) {
    // Time
    sendAddress(0x40, 0x01, 0x34, Math.min(127, time));
    ticks += 480;
    builder.addNoteOn(ticks, 0, 0, 60, 120);
    ticks += 40;
    builder.addNoteOff(ticks, 0, 0, 60);
    ticks += 960;
    time += 16;
}

builder.flush();
void fs.writeFile(
    "files/test_gs__reverb_pan_delay_time.mid",
    new Uint8Array(builder.writeMIDI())
);
