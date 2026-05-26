import { MIDIControllers } from "../../../src";
import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("GS Reverb Delay Level Test");

// Delay (easier to check in audacity)
test.gs(0x40, 0x01, 0x30, [6])
    // Delay feedback
    .gs(0x40, 0x01, 0x35, [0])
    // Time
    .gs(0x40, 0x01, 0x34, [32]);

test.programChange(8, 1, 80).cc(MIDIControllers.reverbDepth, 127);

let level = 0;
while (level <= 128) {
    test.text(`Level = ${level}`)
        // Level
        .gs(0x40, 0x01, 0x33, [Math.min(127, level)])
        .wait(120)
        .noteOn(60, 120)
        .wait(40)
        .noteOff(60)
        .wait(480);
    level += 8;
}

await test.make();
