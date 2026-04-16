import { MIDITestMaker } from "./test_maker";
import { midiControllers } from "../src";

const test = new MIDITestMaker("Vibrato Depth");

// SC-55 sine
test.addProgramChange(8, 1, 80);

// No filter
test.addControllerChange(midiControllers.brightness, 127);
test.addControllerChange(midiControllers.reverbDepth, 0);

// Slower rate
test.addControllerChange(midiControllers.vibratoRate, 48);

test.ticks += 80;
// Short raw play
test.addNoteOn(72, 120);
test.ticks += 480;
test.addNoteOff(72);

// Max vibrato
test.addControllerChange(midiControllers.vibratoDepth, 127);
test.ticks += 480;
test.addNoteOn(72, 120);

// Default test (let it speed up)
test.ticks += 2560;

// Slowly go down

test.sweepCC(midiControllers.vibratoDepth, 127, 0);

test.addNoteOff(72);

test.make();
