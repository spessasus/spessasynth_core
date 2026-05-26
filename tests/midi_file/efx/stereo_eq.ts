import { MIDIControllers } from "../../../src";
import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("Stereo EQ");

test.programChange(16, 3, 80)
    .cc(MIDIControllers.vibratoDepth, 0)
    .cc(MIDIControllers.brightness, 127)
    .cc(MIDIControllers.reverbDepth, 0)
    .wait(80)
    .noteOn(60, 120)
    .wait(480)
    .noteOff(60);

const efx = test.efx(0x01, 0x00);

test.wait(80).noteOn(60, 120);

efx.sweepParam(3, 0, 1, 840)
    .sweepParam(4, 52, 76)
    .sweepParam(5, 0, 1, 840)
    .sweepParam(6, 52, 76)
    .sweepParam(7, 0, 127, 480, 16)
    .sweepParam(8, 1, 4)
    .sweepParam(9, 52, 76)
    .sweepParam(0xa, 0, 127, 480, 16)
    .sweepParam(0xb, 1, 4)
    .sweepParam(0xc, 52, 76);

test.noteOff(60);

await test.make();
