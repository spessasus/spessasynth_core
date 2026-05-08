import { MIDITestMaker } from "./test_maker";
import { MIDIControllers } from "../src";

const test = new MIDITestMaker("Insertion FX Effect Sends");

// SC-55 sine
test.addProgramChange(8, 1, 80);

// No vibrato nor filter
test.addControllerChange(MIDIControllers.vibratoDepth, 0);
test.addControllerChange(MIDIControllers.brightness, 127);
test.addControllerChange(MIDIControllers.reverbDepth, 0);

// First test: delay raw

test.addControllerChange(MIDIControllers.variationDepth, 127);

// Play short note
test.ticks += 60;
test.addNoteOn(60, 127);
test.ticks += 60;
test.addNoteOff(60);

// Listen to delay
test.ticks += 960;

// EFX
const fx = test.testEFX(0, 0);
fx.setParam(0x19, 127);

// Play short note
test.ticks += 60;
test.addNoteOn(60, 127);
test.ticks += 60;
test.addNoteOff(60);

// Listen to delay
test.ticks += 960;

// Mark end
test.addControllerChange(MIDIControllers.variationDepth, 0);
test.make();
