import { MIDIControllers } from "../../../src";
import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("GS Delay Effect Feedback Center Zero");
test.text(
    "This test checks how the feedback behaves when Delay Center Level is set to zero"
);
test.init(8, 1, 80).cc(MIDIControllers.variationDepth, 127);
test.gs(0x40, 0x01, 0x55, [0]) // Level Center = 0
    .gs(0x40, 0x01, 0x57, [127]) // Level Right = 127

    .gs(0x40, 0x01, 0x59, [80]); // Feedback = 16

test.text("Right Delay").note(60, 127, 120).wait(1920);

test.text("Left Delay")
    .gs(0x40, 0x01, 0x57, [0]) // Level Right = 0
    .gs(0x40, 0x01, 0x56, [127]) // Level Left = 127
    .note(60, 127, 120)
    .wait(1920);

await test.make();
