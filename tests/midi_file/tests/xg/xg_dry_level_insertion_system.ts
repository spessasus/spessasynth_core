import { MIDITestMaker } from "../../midi_test_maker";
import { MIDIControllers } from "../../../../src";

const test = new MIDITestMaker("XG Dry Level Insertion System Test", {
    system: "xg"
});

test.cc(MIDIControllers.reverbDepth, 127).note(60, 127).wait(960);

// Dry level = 0
test.xg(0x08, 0x00, 0x11, [0]);

// Variation Type = DELAY L,C,R
test.xg(0x02, 0x01, 0x40, [5, 0]);
// Variation Connection = INSERTION
test.xg(0x02, 0x01, 0x5a, [0]);
// Variation Part Number = 0
test.xg(0x02, 0x01, 0x5b, [0]).wait(480);
test.note(60, 127).wait(960);

// Variation Connection = System
test.xg(0x02, 0x01, 0x5a, [1]).wait(480);
test.note(60, 127).wait(960);

await test.make();
