import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

const test = new MIDITestMaker("Auto Wah");

test.programChange(16, 3, 80)
    .cc(MIDIControllers.vibratoDepth, 0)
    .cc(MIDIControllers.brightness, 127)
    .cc(MIDIControllers.reverbDepth, 0)
    .wait(80)
    .noteOn(24, 127)
    .wait(480)
    .noteOff(24);

const efx = test.efx(0x01, 0x21);

test.wait(480).noteOn(24, 120).wait(2560);

efx.setParam(3, 0);

test.wait(2560);

efx.setParam(3, 1).setParam(8, 0).sweepParam(4, 0, 127, 60).setParam(6, 127);

test.sweepCC(MIDIControllers.mainVolume, 1, 127, 120).cc(
    MIDIControllers.mainVolume,
    100
);

efx.setParam(4, 0)
    .setParam(6, 68)
    .sweepParam(5, 0, 127, 240)
    .setParam(8, 72)
    .sweepParam(5, 0, 100, 240)
    .setParam(7, 40)
    .setParam(5, 68)
    .sweepParam(6, 0, 127, 480, 16)
    .sweepParam(7, 0, 127, 30)
    .setParam(7, 40)
    .sweepParam(8, 0, 127, 480, 16)
    .sweepParam(9, 0, 1, 960);

test.wait(960);

efx.sweepParam(0x15, 0, 127, 30);

test.noteOff(24);

await test.make();
