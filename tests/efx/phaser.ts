import { MIDIControllers } from "../../src";
import { MIDITestMaker } from "../test_maker";

const test = new MIDITestMaker("Phaser");

// P5 Square
test.programChange(16, 3, 80);

// No vibrato nor filter
test.cc(MIDIControllers.vibratoDepth, 0);
test.cc(MIDIControllers.brightness, 127);
test.cc(MIDIControllers.reverbDepth, 0);

test.ticks += 80;
// Short raw play
test.noteOn(60, 120);
test.ticks += 480;
test.noteOff(60);

const efx = test.testEFX(0x01, 0x20);
test.ticks += 480;
test.noteOn(60, 120);

// Default test
test.ticks += 2560;

// Manual
efx.sweepParam(3, 0, 127, 480, 16);

// Reset manual
efx.setParam(3, 36);

// Rate
efx.sweepParam(4, 0, 127, 480, 16);

// Reset rate
efx.setParam(4, 16);

// Depth
efx.sweepParam(5, 0, 127, 480, 16);

// Test depth

test.ticks += 1080;

// Resonance
efx.sweepParam(6, 0, 127, 480, 16);

// Mix
efx.sweepParam(7, 0, 127, 480, 16);

efx.testEqAndLevel();

test.noteOff(60);

test.make("efx");
