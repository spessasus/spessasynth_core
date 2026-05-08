import { MIDITestMaker } from "./test_maker";
import { MIDIControllers } from "../src";

const test = new MIDITestMaker("GS Chorus Level");

// SC-55 sine
test.addProgramChange(8, 1, 80);

// No vibrato nor filter
test.addControllerChange(MIDIControllers.vibratoDepth, 0);
test.addControllerChange(MIDIControllers.brightness, 127);
test.addControllerChange(MIDIControllers.reverbDepth, 0);
test.addControllerChange(MIDIControllers.chorusDepth, 127);
// Hard left, right will be used for gain measurement
test.addControllerChange(MIDIControllers.pan, 0);

test.addNoteOn(60, 127);
test.sweepAddress(0x40, 0x01, 0x3a, 0, 127);
test.addNoteOff(60);
test.make();
