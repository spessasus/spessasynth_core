import { MIDITestMaker } from "../../midi_test_maker";

const test = new MIDITestMaker("GS Drum Change Test");

test.text("This test checks the behavior of USE FOR RHYTHM PART on channel 0.");

test.text("Case 1: melodic baseline");
test.init(0, 0, 0)
    .text("Piano on channel 0, program 0")
    .note(60, 127)
    .wait(480);

test.text("Case 2: USE FOR RHYTHM PART ON");
test.gs(0x40, 0x11, 0x15, [1]).note(38, 127).wait(480);

test.text("Case 3: program change on a drum channel");
test.programChange(0, 0, 0).note(38, 127).wait(480);

test.text("Case 4: RHYTHM PART off");
test.gs(0x40, 0x11, 0x15, [0]).note(60, 127).wait(480);

test.reset("gs").text("Reset").wait(480);

test.text("Case 5: program 16 baseline");
test.init(0, 1, 16).note(60, 127).wait(480);

test.text("Case 6: USE FOR RHYTHM PART at program 16");
test.gs(0x40, 0x11, 0x15, [1]).note(38, 127).wait(480);

test.text("Case 7: program change on a drum channel");
test.programChange(0, 1, 16).note(38, 127).wait(480);

test.text("Case 8: redundant USE FOR RHYTHM PART");
test.gs(0x40, 0x11, 0x15, [1]).note(38, 127).wait(480);

test.text("Case 9: rhythm part with map 2");
test.gs(0x40, 0x11, 0x15, [2]).note(38, 127).wait(480);

test.text("Case 10: RHYTHM PART OFF at program 16");
test.gs(0x40, 0x11, 0x15, [0]).note(60, 127).wait(480);

await test.make();
