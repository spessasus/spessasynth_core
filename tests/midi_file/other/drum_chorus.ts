import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

const test = new MIDITestMaker("Drum Chorus Test", {
    channel: 9
});

test.text("This test enabled chorus on all drums in GS mode.");

for (let i = 0; i < 128; i++) {
    test.nrpn((0x1e << 7) | i, 127);
}
test.cc(MIDIControllers.chorusDepth, 127);

// Copied from generate_drum_pattern.ts example

const TICKS_PER_BEAT = 480;

// A simple helper function to add drum notes
const addNote = (midiNote: number) => {
    // Channel 9 is by default the drum channel
    test.note(midiNote, 120, 0);
};

// Side stick intro
for (let i = 0; i < 4; i++) {
    addNote(37);
    test.wait(TICKS_PER_BEAT);
}

const HALF_BEAT = TICKS_PER_BEAT / 2;

for (let i = 0; i < 4; i++) {
    addNote(49); // Crash
    // 4 measures
    for (let i = 0; i < 4; i++) {
        // One measure
        addNote(36); // Kick
        test.wait(HALF_BEAT);

        addNote(42); // Hi-hat
        test.wait(HALF_BEAT);

        addNote(38); // Snare
        test.wait(HALF_BEAT);

        addNote(42); // Hi-hat
        test.wait(HALF_BEAT);

        addNote(36); // Kick
        test.wait(HALF_BEAT);

        addNote(42); // Hi-hat
        test.wait(HALF_BEAT);

        addNote(38); // Snare
        test.wait(HALF_BEAT);

        addNote(42); // Hi-hat
        test.wait(HALF_BEAT / 2);

        addNote(38); // Extra snare
        test.wait(HALF_BEAT / 2);
    }
}

await test.make();
