import { MIDIControllers } from "../src";
import { MIDITestMaker } from "./test_maker";

const test = new MIDITestMaker("GS Delay Level");

// No feedback
test.sendAddress(0x40, 0x01, 0x59, [64]);

// SC-55 sine
test.addProgramChange(8, 1, 80);

// No vibrato nor filter
test.addControllerChange(MIDIControllers.vibratoDepth, 0);
test.addControllerChange(MIDIControllers.brightness, 127);
test.addControllerChange(MIDIControllers.reverbDepth, 0);
test.addControllerChange(MIDIControllers.variationDepth, 127);

let level = 0;
while (level <= 128) {
    // Level
    test.sendAddress(0x40, 0x01, 0x58, [Math.min(127, level)]);
    test.ticks += 120;
    test.addNoteOn(60, 127);
    test.ticks += 40;
    test.addNoteOff(60);
    test.ticks += 480;
    level += 8;
}

test.make();
