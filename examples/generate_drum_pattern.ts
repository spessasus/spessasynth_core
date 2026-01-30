import { MIDIBuilder } from "../src";
import * as fs from "node:fs/promises";

// A simple example showing how to generate a 4/4 drum pattern with the MIDI builder.

// Recommended and the default
const TICKS_PER_BEAT = 480;

const builder = new MIDIBuilder({
    name: "Simple Drum Pattern",
    timeDivision: TICKS_PER_BEAT
});

// Time tracking, in MIDI ticks.
// MIDI ticks are not seconds - instead, they are fractions of a beat.
// Time division specifies how many ticks are in a beat, and the duration in seconds is determined by tempo.
let ticks = 0;

// A simple helper function to add drum notes
const addNote = (midiNote: number) => {
    // Channel 9 is by default the drum channel
    builder.addNoteOn(ticks, 0, 9, midiNote, 120);
    builder.addNoteOff(ticks, 0, 9, midiNote); // Drum notes can be released immediately
};

// Side stick intro
for (let i = 0; i < 4; i++) {
    addNote(37);
    ticks += TICKS_PER_BEAT;
}

const HALF_BEAT = TICKS_PER_BEAT / 2;

for (let i = 0; i < 4; i++) {
    addNote(49); // Crash
    // 4 measures
    for (let i = 0; i < 4; i++) {
        // One measure
        addNote(36); // Kick
        ticks += HALF_BEAT;

        addNote(42); // Hi-hat
        ticks += HALF_BEAT;

        addNote(38); // Snare
        ticks += HALF_BEAT;

        addNote(42); // Hi-hat
        ticks += HALF_BEAT;

        addNote(36); // Kick
        ticks += HALF_BEAT;

        addNote(42); // Hi-hat
        ticks += HALF_BEAT;

        addNote(38); // Snare
        ticks += HALF_BEAT;

        addNote(42); // Hi-hat
        ticks += HALF_BEAT / 2;

        addNote(38); // Extra snare
        ticks += HALF_BEAT / 2;
    }
}

builder.flush();

await fs.writeFile("drum_pattern.mid", new Uint8Array(builder.writeMIDI()));
console.info("File written to drum_pattern.mid");
