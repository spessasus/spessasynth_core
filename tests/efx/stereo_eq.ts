import { midiControllers } from "../../src";
import { EFXTestMaker } from "./test_maker";

const test = new EFXTestMaker("Stereo EQ");

// P5 Square
test.addControllerChange(0, 0, midiControllers.bankSelect, 16);
test.addProgramChange(0, 0, 80);

// No vibrato nor filter
test.addControllerChange(0, 0, midiControllers.vibratoDepth, 0);
test.addControllerChange(0, 0, midiControllers.brightness, 127);
test.addControllerChange(0, 0, midiControllers.reverbDepth, 0);

test.ticks += 80;
// Short raw play
test.addNoteOn(0, 0, 60, 120);
test.ticks += 480;
test.addNoteOff(0, 0, 60);

test.setEFX(0x01, 0x00);
test.ticks += 80;
test.addNoteOn(0, 0, 60, 120);

// Low Freq
test.sweepEFXParam(3, 0, 1, 840);

// Low Gain
test.sweepEFXParam(4, 52, 76);

// Hi Freq
test.sweepEFXParam(5, 0, 1, 840);

// Hi Gain
test.sweepEFXParam(6, 52, 76);

// Mid 1 freq
test.sweepEFXParam(7, 0, 127, 480, 16);
// Mid 1 Q
test.sweepEFXParam(8, 1, 4);
// Mid 1 Gain
test.sweepEFXParam(9, 52, 76);

// Mid 2 freq
test.sweepEFXParam(0xa, 0, 127, 480, 16);
// Mid 2 Q
test.sweepEFXParam(0xb, 1, 4);
// Mid 2 Gain
test.sweepEFXParam(0xc, 52, 76);

test.addNoteOff(0, 0, 60);

test.make();
