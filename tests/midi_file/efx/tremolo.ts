import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

const test = new MIDITestMaker("Tremolo EFX Test");

test.programChange(8, 1, 80)
    .cc(MIDIControllers.vibratoDepth, 0)
    .cc(MIDIControllers.brightness, 127)
    .cc(MIDIControllers.reverbDepth, 0)
    .wait(80)
    .noteOn(60, 120)
    .wait(480)
    .noteOff(60);

const efx = test.efx(0x01, 0x25);

test.wait(480)
    .text("Basic note test")
    .noteOn(60, 120)
    .wait(2560)
    .text("Param test");

efx.sweepParam(3, 0, 4, 960, 1)
    .sweepParam(4, 0, 127, 480, 16)
    .setParam(3, 0)
    .sweepParam(5, 0, 127, 240, 8);

test.wait(960).noteOff(60);

await test.make();
