import { midiControllers } from "../src";
import { MIDITestMaker } from "./test_maker";

const test = new MIDITestMaker("GS Delay Level");

// No feedback
test.sendAddress(0x40, 0x01, 0x59, [64]);

// SC-55 sine
test.addProgramChange(8, 1, 80);

// No vibrato nor filter
test.addControllerChange(midiControllers.vibratoDepth, 0);
test.addControllerChange(midiControllers.brightness, 127);
test.addControllerChange(midiControllers.reverbDepth, 0);
test.addControllerChange(midiControllers.variationDepth, 127);

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
