import { MIDIControllers } from "../../../src";
import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("Phaser Manual Param");

test.programChange(16, 3, 80)
    .cc(MIDIControllers.vibratoDepth, 0)
    .cc(MIDIControllers.brightness, 127)
    .cc(MIDIControllers.reverbDepth, 0)
    .wait(80);

const NOTE = 24;

test.noteOn(NOTE, 120).wait(480).noteOff(NOTE);

const efx = test.efx(0x01, 0x20);

test.wait(480).noteOn(NOTE, 120);

efx.setParam(5, 0).setParam(6, 0).sweepParam(3, 0, 127);

test.wait(480).noteOff(NOTE);

await test.make();
