import { MIDIControllers } from "../../../src";
import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("GS Reverb Pan Delay Feedback Test");

// Panning delay
test.gs(0x40, 0x01, 0x30, [7])
    // Level
    .gs(0x40, 0x01, 0x33, [127])
    // Time
    .gs(0x40, 0x01, 0x34, [48]);

test.programChange(8, 1, 80).cc(MIDIControllers.reverbDepth, 127);

let feedback = 0;
while (feedback <= 128) {
    test.text(`Feedback = ${feedback}`)
        // Feedback
        .gs(0x40, 0x01, 0x35, [Math.min(127, feedback)])
        .wait(480)
        .noteOn(60, 120)
        .wait(40)
        .noteOff(60)
        .wait(2880);
    feedback += 16;
}

await test.make();
