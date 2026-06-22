import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

const test = new MIDITestMaker("GS Filter Test");

// MG Square, no reverb, max volume and no vibrato
test.programChange(1, 1, 80)
    .cc(MIDIControllers.reverbDepth, 0)
    .cc(MIDIControllers.mainVolume, 127)
    .cc(MIDIControllers.vibratoDepth, 0);

test.text("MG Square").note(60, 127, 960).wait(480);

test.text("CC#71 = 0")
    .cc(MIDIControllers.filterResonance, 0)
    .note(60, 127, 960)
    .cc(MIDIControllers.filterResonance, 64)
    .wait(480);

test.text("CC#74 Max")
    .cc(MIDIControllers.brightness, 127)
    .note(60, 127, 960)
    .cc(MIDIControllers.brightness, 64)
    .wait(480);

test.text("CC#74 Sweep, top half")
    .noteOn(60, 127)
    .sweepCC(MIDIControllers.brightness, 64, 127, 20)
    .noteOff(60)
    .cc(MIDIControllers.brightness, 64)
    .wait(480);

test.text("CC#74 Sweep")
    .noteOn(60, 127)
    .sweepCC(MIDIControllers.brightness, 0, 127, 10)
    .noteOff(60)
    .cc(MIDIControllers.brightness, 64)
    .wait(480);

test.text("CC#74 Sweep, CC#74 = 127")
    .cc(MIDIControllers.filterResonance, 127)
    .noteOn(60, 127)
    .sweepCC(MIDIControllers.brightness, 0, 127, 10)
    .noteOff(60)
    .cc(MIDIControllers.brightness, 64)
    .wait(480);

test.text("CC#71 sweep")
    .noteOn(60, 127)
    .sweepCC(MIDIControllers.filterResonance, 0, 127, 10)
    .noteOff(60);

await test.make();
