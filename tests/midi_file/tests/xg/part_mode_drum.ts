import { MIDITestMaker } from "../../midi_test_maker";
import { MIDIControllers } from "../../../../src";

const test = new MIDITestMaker("XG Part Mode Drum Test", {
    system: "xg"
});

test.text(
    "This test checks the behavior of changing drums in XG on channel 0."
);

test.text("Case 1: melodic baseline");
test.init(0, 0, 0).note(38, 127).wait(480);

test.text("Case 2: bank select only");
test.cc(MIDIControllers.bankSelect, 127)
    .note(38, 127)
    .cc(MIDIControllers.bankSelect, 0)
    .wait(480);

test.text("Case 3: PART MODE DRUM at program 0");
test.xg(0x08, 0x00, 0x07, [1]).note(38, 127).wait(480);

test.text("Case 4: program change with no bank");
test.programChangeOnly(16).note(38, 127).wait(480);

test.text("Case 5: melodic detour");
test.programChange(0, 0, 0).programChangeOnly(16).note(38, 127).wait(480);

test.text("Case 6: program change to drum bank");
test.programChange(127, 0, 16).note(38, 127).wait(480);

test.text("Case 7: PART MODE MELODIC with detour");
test.xg(0x08, 0x00, 0x07, [0]).note(38, 127).wait(480);

test.text("Case 8: program change back to melodic");
test.programChange(0, 0, 0).note(38, 127).wait(480);

test.reset("xg").text("Reset").wait(480);

test.text("Case 9: organ baseline");
test.init(0, 0, 16).note(38, 127).wait(480);

test.text("Case 10: PART MODE DRUM with no prior melodic");
test.xg(0x08, 0x00, 0x07, [1]).note(38, 127).wait(480);

test.text("Case 11: program change to drum bank");
test.programChange(127, 0, 16).note(38, 127).wait(480);

test.text("Case 12: PART MODE MELODIC with no prior melodic");
test.xg(0x08, 0x00, 0x07, [0]).note(38, 127).wait(480);

test.reset("xg").text("Reset").wait(480);

test.text("Case 13: organ baseline again");
test.init(0, 0, 16).note(38, 127).wait(480);

test.text("Case 14: PART MODE DRUM again");
test.xg(0x08, 0x00, 0x07, [1]).note(38, 127).wait(480);

test.text("Case 15: out of range program change");
test.programChangeOnly(127).note(38, 127).wait(480);

await test.make();
