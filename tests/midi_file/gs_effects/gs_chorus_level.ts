import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

const test = new MIDITestMaker("GS Chorus Level");

test.programChange(8, 1, 80)
    .cc(MIDIControllers.vibratoDepth, 0)
    .cc(MIDIControllers.brightness, 127)
    .cc(MIDIControllers.reverbDepth, 0)
    .cc(MIDIControllers.chorusDepth, 127)
    .cc(MIDIControllers.pan, 0)
    .noteOn(60, 127)
    .sweepGS(0x40, 0x01, 0x3a, 0, 127)
    .noteOff(60);

await test.make();
