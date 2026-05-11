import { MIDIControllers } from "../src";
import { MIDITestMaker } from "./test_maker";

const test = new MIDITestMaker("GS Delay Level");

// No feedback
test.gs(0x40, 0x01, 0x59, [64]);

// SC-55 sine
test.programChange(8, 1, 80);

// No vibrato nor filter
test.cc(MIDIControllers.vibratoDepth, 0);
test.cc(MIDIControllers.brightness, 127);
test.cc(MIDIControllers.reverbDepth, 0);
test.cc(MIDIControllers.variationDepth, 127);

let level = 0;
while (level <= 128) {
    // Level
    test.gs(0x40, 0x01, 0x58, [Math.min(127, level)]);
    test.ticks += 120;
    test.noteOn(60, 127);
    test.ticks += 40;
    test.noteOff(60);
    test.ticks += 480;
    level += 8;
}

test.make();
