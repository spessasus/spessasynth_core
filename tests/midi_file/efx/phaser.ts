import { MIDIControllers } from "../../../src";
import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("Phaser");

test.programChange(16, 3, 80)
    .cc(MIDIControllers.vibratoDepth, 0)
    .cc(MIDIControllers.brightness, 127)
    .cc(MIDIControllers.reverbDepth, 0)
    .wait(80)
    .noteOn(60, 120)
    .wait(480)
    .noteOff(60);

const efx = test.efx(0x01, 0x20);

test.wait(480).noteOn(60, 120).wait(2560);

test.text("Testing param 3");
efx.sweepParam(3, 0, 127, 480, 16);
efx.setParam(3, 36);

test.text("Testing param 4");
efx.sweepParam(4, 0, 127, 480, 16);
efx.setParam(4, 16);

test.text("Testing param 5");
efx.sweepParam(5, 0, 127, 480, 16);

test.wait(1080);

test.text("Testing params 6 and 7");
efx.sweepParam(6, 0, 127, 480, 16);
efx.sweepParam(7, 0, 127, 480, 16);
efx.testEqAndLevel();

test.noteOff(60);

await test.make();
