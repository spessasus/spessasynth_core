import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

const test = new MIDITestMaker("GS Filter Test");

// MG Square, no reverb, max volume and no vibrato
test.programChange(1, 1, 80)
    .cc(MIDIControllers.reverbDepth, 0)
    .cc(MIDIControllers.mainVolume, 127)
    .cc(MIDIControllers.vibratoDepth, 0)
    .cc(MIDIControllers.vibratoRate, 0)
    .cc(MIDIControllers.vibratoDelay, 127);

test.text("MG Square").note(60, 127, 960).wait(480);

test.text("CC#71 = 0")
    .nrpn(0xa1, 0)
    .note(60, 127, 960)
    .nrpn(0xa1, 64)
    .wait(480);

test.text("CC#74 Max")
    .nrpn(0xa0, 127)
    .note(60, 127, 960)
    .nrpn(0xa0, 64)
    .wait(480);

test.text("CC#74 Sweep, top half")
    .noteOn(60, 127)
    .sweepNrpn(0xa0, 64, 127, 20)
    .nrpn(0xa0, 64)
    .wait(480)
    .noteOff(60)
    .wait(480);

test.text("CC#74 Sweep")
    .noteOn(60, 127)
    .sweepNrpn(0xa0, 0, 127, 10)
    .noteOff(60)
    .nrpn(0xa0, 64)
    .wait(480);

test.text("CC#74 Sweep, CC#74 = 127")
    .nrpn(0xa1, 127)
    .noteOn(60, 127)
    .sweepNrpn(0xa0, 0, 127, 10)
    .nrpn(0xa0, 64)
    .wait(480)
    .noteOff(60)
    .wait(480);

test.text("CC#71 sweep")
    .noteOn(60, 127)
    .sweepNrpn(0xa1, 0, 127, 10)
    .noteOff(60);

await test.make();
