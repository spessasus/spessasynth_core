import { MIDITestMaker } from "./test_maker";
import { midiControllers } from "../src";

const test = new MIDITestMaker("Insertion FX Effect Sends");

// SC-55 sine
test.addProgramChange(8, 1, 80);

// No vibrato nor filter
test.addControllerChange(midiControllers.vibratoDepth, 0);
test.addControllerChange(midiControllers.brightness, 127);
test.addControllerChange(midiControllers.reverbDepth, 0);

// First test: delay raw

test.addControllerChange(midiControllers.variationDepth, 127);

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
test.addControllerChange(midiControllers.variationDepth, 0);
test.make();
