import { MIDITestMaker } from "../../midi_test_maker";
import { MIDIControllers } from "../../../../src";

const test = new MIDITestMaker("XG Variation Insertion Mode Effect Sends", {
    system: "xg"
});

test.note(60, 127).wait(480);

// Variation part = 0
test.xg(0x02, 0x01, 0x5b, [0]).note(60, 127).wait(480);

test.cc(MIDIControllers.reverbDepth, 127)
    .cc(MIDIControllers.chorusDepth, 127)
    .note(60, 127)
    .wait(480);

await test.make();
