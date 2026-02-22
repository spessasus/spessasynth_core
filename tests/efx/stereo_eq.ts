import { midiControllers } from "../../src";
import { MIDITestMaker } from "./test_maker";

const test = new MIDITestMaker("Stereo EQ");

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

const efx = test.testEFX(0x01, 0x00);
test.ticks += 80;
test.addNoteOn(60, 120);

// Low Freq
efx.sweepParam(3, 0, 1, 840);

// Low Gain
efx.sweepParam(4, 52, 76);

// Hi Freq
efx.sweepParam(5, 0, 1, 840);

// Hi Gain
efx.sweepParam(6, 52, 76);

// Mid 1 freq
efx.sweepParam(7, 0, 127, 480, 16);
// Mid 1 Q
efx.sweepParam(8, 1, 4);
// Mid 1 Gain
efx.sweepParam(9, 52, 76);

// Mid 2 freq
efx.sweepParam(0xa, 0, 127, 480, 16);
// Mid 2 Q
efx.sweepParam(0xb, 1, 4);
// Mid 2 Gain
efx.sweepParam(0xc, 52, 76);

test.addNoteOff(60);

test.make();
