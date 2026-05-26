import { MIDIControllers } from "../../../src";
import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("GS Reverb Delay Time Test");

// Delay
test.gs(0x40, 0x01, 0x30, [6])
    // Level
    .gs(0x40, 0x01, 0x33, [127])
    // Delay feedback
    .gs(0x40, 0x01, 0x35, [0]);

test.programChange(1, 1, 80);
test.cc(MIDIControllers.reverbDepth, 127);

let time = 0;
while (time <= 128) {
    test.text(`Delay Time = ${time}`);
    // Time
    test.gs(0x40, 0x01, 0x34, [Math.min(127, time)])
        .wait(480)
        .noteOn(60, 120)
        .wait(40)
        .noteOff(60)
        .wait(960);
    time += 16;
}

await test.make();
