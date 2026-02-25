import { midiControllers } from "../../src";
import { MIDITestMaker } from "./test_maker";

const test = new MIDITestMaker("Phaser Manual Param");

// P5 Square
test.addProgramChange(16, 3, 80);

// No vibrato nor filter
test.addControllerChange(midiControllers.vibratoDepth, 0);
test.addControllerChange(midiControllers.brightness, 127);
test.addControllerChange(midiControllers.reverbDepth, 0);

test.ticks += 80;
// Short raw play
test.addNoteOn(60, 120);
test.ticks += 480;
test.addNoteOff(60);

const efx = test.testEFX(0x01, 0x20);
test.ticks += 480;
test.addNoteOn(60, 120);

// No depth
efx.setParam(5, 0);

// No reso
efx.setParam(6, 0);

// Manual
efx.sweepParam(3, 0, 127);

test.ticks += 480;
test.addNoteOff(60);

test.make();
