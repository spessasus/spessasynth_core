import {
    IndexedByteArray,
    MIDIBuilder,
    midiControllers,
    midiMessageTypes
} from "../src";
import fs from "fs/promises";

const builder = new MIDIBuilder({
    name: "GS Delay Feedback Test"
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

// Delay1
sendAddress(0x40, 0x01, 0x50, 0);
// Delay time center
sendAddress(0x40, 0x01, 0x52, 0x49);

builder.addControllerChange(ticks, 0, 0, midiControllers.reverbDepth, 0);
builder.addControllerChange(ticks, 0, 0, midiControllers.chorusDepth, 0);
builder.addControllerChange(ticks, 0, 0, midiControllers.variationDepth, 127);

// SC-55 MAP sine wave
builder.addControllerChange(ticks, 0, 0, midiControllers.bankSelectLSB, 1);
builder.addControllerChange(ticks, 0, 0, midiControllers.bankSelect, 8);
builder.addProgramChange(ticks, 0, 0, 80);

let feedback = 1;
while (feedback <= 126) {
    // Feedback
    sendAddress(0x40, 0x01, 0x59, Math.min(127, feedback));
    ticks += 80;
    builder.addNoteOn(ticks, 0, 0, 60, 120);
    ticks += 10;
    builder.addNoteOff(ticks, 0, 0, 60);
    ticks += 1960;
    feedback += 1;
}

builder.flush();
void fs.writeFile(
    "files/test_gs_delay_feedback.mid",
    new Uint8Array(builder.writeMIDI())
);
