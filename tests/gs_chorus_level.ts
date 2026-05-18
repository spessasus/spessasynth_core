import { MIDITestMaker } from "./test_maker";
import { MIDIControllers } from "../src";

const test = new MIDITestMaker("GS Chorus Level");

// SC-55 sine
test.programChange(8, 1, 80);

// No vibrato nor filter
test.cc(MIDIControllers.vibratoDepth, 0);
test.cc(MIDIControllers.brightness, 127);
test.cc(MIDIControllers.reverbDepth, 0);
test.cc(MIDIControllers.chorusDepth, 127);
// Hard left, right will be used for gain measurement
test.cc(MIDIControllers.pan, 0);

test.noteOn(60, 127);
test.sweepGS(0x40, 0x01, 0x3a, 0, 127);
test.noteOff(60);
test.make();
