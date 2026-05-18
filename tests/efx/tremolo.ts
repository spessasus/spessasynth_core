import { MIDITestMaker } from "../test_maker";
import { MIDIControllers } from "../../src";

const test = new MIDITestMaker("Tremolo");

// SC-55 sine
test.programChange(8, 1, 80);

// No vibrato nor filter
test.cc(MIDIControllers.vibratoDepth, 0);
test.cc(MIDIControllers.brightness, 127);
test.cc(MIDIControllers.reverbDepth, 0);

test.ticks += 80;
// Short raw play
test.noteOn(60, 120);
test.ticks += 480;
test.noteOff(60);

const efx = test.testEFX(0x01, 0x25);
test.ticks += 480;
test.noteOn(60, 120);

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

test.noteOff(60);

test.make("efx");
