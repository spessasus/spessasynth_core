import { MIDITestMaker } from "../test_maker";
import { midiControllers } from "../../src";

const test = new MIDITestMaker("Auto Pan");

// SC-55 sine
test.addProgramChange(8, 1, 80);

// No vibrato nor filter
test.addControllerChange(midiControllers.vibratoDepth, 0);
test.addControllerChange(midiControllers.brightness, 127);
test.addControllerChange(midiControllers.reverbDepth, 0);

test.ticks += 80;
// Short raw play
test.addNoteOn(60, 120);
test.ticks += 480;
test.addNoteOff(60);

const efx = test.testEFX(0x01, 0x26);
test.ticks += 480;
test.addNoteOn(60, 120);

// Default test
test.ticks += 2560;

// Mod wave
efx.sweepParam(3, 0, 4, 960, 1);

// Mod rate
efx.sweepParam(4, 0, 127, 480, 16);

// Set back to triangle
efx.setParam(3, 0);

// Mod depth
efx.sweepParam(5, 0, 127, 240, 8);

// Play at highest for a bit
test.ticks += 960;

efx.testEqAndLevel();

test.addNoteOff(60);

test.make("efx");
