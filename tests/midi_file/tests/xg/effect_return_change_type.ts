import { MIDITestMaker } from "../../midi_test_maker";
import { MIDIControllers } from "../../../../src";

const test = new MIDITestMaker(
    "XG Effect Return And Pan Type Change Behavior Test",
    { system: "xg" }
);

test.cc(MIDIControllers.reverbDepth, 127).note(60, 127).wait(480);

// Reverb return = 0
test.xg(0x02, 0x01, 0x0c, [0]).note(60, 127).wait(480);

// Reverb type = ROOM
test.xg(0x02, 0x01, 0x00, [2, 0]).note(60, 127).wait(480);

await test.make();
