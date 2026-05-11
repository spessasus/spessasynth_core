import {
    IndexedByteArray,
    MIDIBuilder,
    MIDIControllers,
    MIDIMessageTypes
} from "../src";
import fs from "node:fs/promises";

const builder = new MIDIBuilder({
    name: "GS Drum Pitch NRPN Test"
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

let MIDI_NOTE = 50;

builder.controllerChange(ticks, 0, 9, MIDIControllers.reverbDepth, 0);
// SC-88Pro MAP STANDARD
builder.controllerChange(ticks, 0, 9, MIDIControllers.bankSelectLSB, 3);
builder.programChange(ticks, 0, 9, 0);

let pitch = 50;
while (pitch <= 70) {
    // Rate
    builder.nonRegisteredParameter(
        ticks,
        0,
        9,
        (0x18 << 7) | MIDI_NOTE,
        pitch << 7
    );
    builder.controllerChange(ticks, 0, 9, MIDIControllers.dataEntryMSB, pitch);
    ticks += 240;
    builder.noteOn(ticks, 0, 9, MIDI_NOTE, 120);
    ticks += 80;
    builder.noteOff(ticks, 0, 9, MIDI_NOTE);
    pitch += 1;
}

ticks += 480;

MIDI_NOTE = 48; // The same tom pitch compared to 88Pro
// SC-55 MAP STANDARD
builder.controllerChange(ticks, 0, 9, MIDIControllers.bankSelectLSB, 1);
builder.programChange(ticks, 0, 9, 0);

ticks += 480;

pitch = 50;
while (pitch <= 70) {
    // Rate
    builder.nonRegisteredParameter(
        ticks,
        0,
        9,
        (0x18 << 7) | MIDI_NOTE,
        pitch << 7
    );
    ticks += 240;
    builder.noteOn(ticks, 0, 9, MIDI_NOTE, 120);
    ticks += 80;
    builder.noteOff(ticks, 0, 9, MIDI_NOTE);
    pitch += 1;
}

builder.flush();
void fs.writeFile(
    "files/test_gs_drum_pitch_nrpn.mid",
    new Uint8Array(builder.writeMIDI())
);
