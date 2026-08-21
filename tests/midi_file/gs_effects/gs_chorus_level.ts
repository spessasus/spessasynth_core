import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

const test = new MIDITestMaker("GS Chorus Level");

test.init(8, 1, 80, { brightness: 127, chorusDepth: 127 })
    .cc(MIDIControllers.pan, 0)
    .noteOn(60, 127)
    .sweepGS(0x40, 0x01, 0x3a, 0, 127)
    .noteOff(60);

await test.make();
