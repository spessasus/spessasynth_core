import { MIDIControllers } from "../../../src";
import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("GS Reverb Delay Feedback Test");

// Delay
test.gs(0x40, 0x01, 0x30, [6])
    // Level
    .gs(0x40, 0x01, 0x33, [127])
    // Time
    .gs(0x40, 0x01, 0x34, [32]);

test.programChange(1, 1, 80);
test.cc(MIDIControllers.reverbDepth, 127);

let feedback = 0;
while (feedback <= 128) {
    test.text(`Feedback = ${feedback}`)
        // Delay feedback
        .gs(0x40, 0x01, 0x35, [Math.min(feedback, 127)])

        .wait(480)
        .noteOn(60, 120)
        .wait(40)
        .noteOff(60)
        .wait(960);
    feedback += 16;
}

await test.make();
