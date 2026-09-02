import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("GS Reverb Character Test");

// Hall 4
test.gs(0x40, 0x01, 0x30, [4])
    // Level
    .gs(0x40, 0x01, 0x33, [127])
    // Predelay
    .gs(0x40, 0x01, 0x37, [127]);

test.init(1, 1, 80, { reverbDepth: 127 });

for (let i = 0; i < 8; i++) {
    test.text(`Character = ${i}`);
    // Character
    test.gs(0x40, 0x01, 0x31, [i])
        .wait(480)
        .noteOn(60, 120)
        .wait(40)
        .noteOff(60)
        .wait(1920);
}

await test.make();
