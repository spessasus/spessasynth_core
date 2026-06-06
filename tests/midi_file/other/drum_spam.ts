import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("Drum Spam Test", {
    channel: 9
});

// Analog (TR-808)
test.programChange(0, 0, 25);

for (let i = 0; i < 120; i++) {
    test.note(36, 120, 10);
}

await test.make();
