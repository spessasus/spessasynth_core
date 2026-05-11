import { MIDIControllers } from "../../src";
import { MIDITestMaker } from "../test_maker";

const test = new MIDITestMaker("Phaser Manual Param");

// P5 Square
test.programChange(16, 3, 80);

// No vibrato nor filter
test.cc(MIDIControllers.vibratoDepth, 0);
test.cc(MIDIControllers.brightness, 127);
test.cc(MIDIControllers.reverbDepth, 0);

const NOTE = 24;
test.ticks += 80;
// Short raw play
test.noteOn(NOTE, 120);
test.ticks += 480;
test.noteOff(NOTE);

const efx = test.testEFX(0x01, 0x20);
test.ticks += 480;
test.noteOn(NOTE, 120);

// No depth
efx.setParam(5, 0);

// No reso
efx.setParam(6, 0);

// Manual
efx.sweepParam(3, 0, 127);

test.ticks += 480;
test.noteOff(NOTE);

test.make("efx");
