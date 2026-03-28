import {
    IndexedByteArray,
    MIDIBuilder,
    midiControllers,
    midiMessageTypes
} from "../src";
import fs from "fs/promises";

const builder = new MIDIBuilder({
    name: "GS Drum Pitch NRPN Test"
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

let ticks = 780;

let MIDI_NOTE = 50;

builder.addControllerChange(ticks, 0, 9, midiControllers.reverbDepth, 0);
// SC-88Pro MAP STANDARD
builder.addControllerChange(ticks, 0, 9, midiControllers.bankSelectLSB, 3);
builder.addProgramChange(ticks, 0, 9, 0);

let pitch = 50;
while (pitch <= 70) {
    // Rate
    builder.addControllerChange(
        ticks,
        0,
        9,
        midiControllers.nonRegisteredParameterMSB,
        0x18
    );
    builder.addControllerChange(
        ticks,
        0,
        9,
        midiControllers.nonRegisteredParameterLSB,
        MIDI_NOTE
    );
    builder.addControllerChange(
        ticks,
        0,
        9,
        midiControllers.dataEntryMSB,
        pitch
    );
    ticks += 240;
    builder.addNoteOn(ticks, 0, 9, MIDI_NOTE, 120);
    ticks += 80;
    builder.addNoteOff(ticks, 0, 9, MIDI_NOTE);
    pitch += 1;
}

ticks += 480;

MIDI_NOTE = 48; // The same tom pitch compared to 88Pro
// SC-55 MAP STANDARD
builder.addControllerChange(ticks, 0, 9, midiControllers.bankSelectLSB, 1);
builder.addProgramChange(ticks, 0, 9, 0);

ticks += 480;

pitch = 50;
while (pitch <= 70) {
    // Rate
    builder.addControllerChange(
        ticks,
        0,
        9,
        midiControllers.nonRegisteredParameterMSB,
        0x18
    );
    builder.addControllerChange(
        ticks,
        0,
        9,
        midiControllers.nonRegisteredParameterLSB,
        MIDI_NOTE
    );
    builder.addControllerChange(
        ticks,
        0,
        9,
        midiControllers.dataEntryMSB,
        pitch
    );
    ticks += 240;
    builder.addNoteOn(ticks, 0, 9, MIDI_NOTE, 120);
    ticks += 80;
    builder.addNoteOff(ticks, 0, 9, MIDI_NOTE);
    pitch += 1;
}

builder.flush();
void fs.writeFile(
    "files/test_gs_drum_pitch_nrpn.mid",
    new Uint8Array(builder.writeMIDI())
);
