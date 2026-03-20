import { MIDITestMaker } from "../test_maker";
import { midiControllers } from "../../src";

const test = new MIDITestMaker("Auto Wah");

// P5 Square
test.addProgramChange(16, 3, 80);

// No vibrato nor filter
test.addControllerChange(midiControllers.vibratoDepth, 0);
test.addControllerChange(midiControllers.brightness, 127);
test.addControllerChange(midiControllers.reverbDepth, 0);

test.ticks += 80;
// Short raw play
test.addNoteOn(24, 127);
test.ticks += 480;
test.addNoteOff(24);

const efx = test.testEFX(0x01, 0x21);
test.ticks += 480;
test.addNoteOn(24, 120);

// Default test
test.ticks += 2560;

// Fil type
efx.setParam(3, 0);

test.ticks += 2560;

// Fil type reset
efx.setParam(3, 1);

// No Depth
efx.setParam(8, 0);

// Sens
efx.sweepParam(4, 0, 127, 60);

// Sens volume test
// Set peak to max to see better
efx.setParam(6, 127);
test.sweepCC(midiControllers.mainVolume, 1, 127, 120);

test.addControllerChange(midiControllers.mainVolume, 100);

// Reset params
efx.setParam(4, 0);
efx.setParam(6, 68);

// Manual
efx.sweepParam(5, 0, 127, 240);

// Reset depth
efx.setParam(8, 72);

// Manual with LFO (don't sweep to 127 because SCVA crashes?)
efx.sweepParam(5, 0, 100, 240);

// Reset manual and rate
efx.setParam(7, 40);
efx.setParam(5, 68);

// Peak
efx.sweepParam(6, 0, 127, 480, 16);

// Rate
efx.sweepParam(7, 0, 127, 30);

// Reset rate
efx.setParam(7, 40);

// Depth
efx.sweepParam(8, 0, 127, 480, 16);

// Polarity
efx.sweepParam(9, 0, 1, 960);

test.ticks += 960;

// Pan
efx.sweepParam(0x15, 0, 127, 30);

test.addNoteOff(24);

test.make("efx");
