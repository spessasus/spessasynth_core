import { MIDIControllers } from "../../../src";
import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("GS Effect Send Level Test");

test.init(8, 1, 80);

// FIXME: Seems to differ SIGNIFICANTLY from reference!
// Set up delay so only right channel plays at 100% volume

test.gs(0x40, 0x01, 0x55, [0]) // Level Center = 0
    .gs(0x40, 0x01, 0x57, [127]) // Level Right = 100

    .gs(0x40, 0x01, 0x59, [64]) // Feedback = 0
    .gs(0x40, 0x01, 0x52, [1]); // Time Center = 0.1ms

test.text("Short delay setup test")
    .cc(MIDIControllers.pan, 0)
    .cc(MIDIControllers.variationDepth, 127)
    .note(60, 127, 480)
    .wait(960);

test.text("Beginning the send level test")
    .cc(MIDIControllers.variationDepth, 0)
    .noteOn(60, 127)
    .sweepCC(MIDIControllers.variationDepth, 0, 127, 120)
    .noteOff(60)
    .wait(480);

test.text("Send level test - rapid switch")
    .cc(MIDIControllers.variationDepth, 0)
    .noteOn(60, 127);

test.cc(MIDIControllers.variationDepth, 127)
    .wait(480)
    .cc(MIDIControllers.variationDepth, 0)
    .wait(480)
    .cc(MIDIControllers.variationDepth, 127)
    .wait(480)
    .cc(MIDIControllers.variationDepth, 0)
    .wait(480);

test.noteOff(60);

await test.make();
