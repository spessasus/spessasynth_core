import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

const test = new MIDITestMaker("Full CC Precision Test");

test.init(8, 1, 80);

test.text("CC#7 only sweep")
    .noteOn(60, 127)
    .sweepCC(MIDIControllers.mainVolume, 0, 127, 120)
    .noteOff(60)
    .wait(480);

test.text("14-bit sweep").noteOn(60, 127);

for (let i = 0; i < 16_383; i++) {
    test.cc(MIDIControllers.mainVolume, i >> 7)
        .cc(MIDIControllers.mainVolumeLSB, i & 127)
        .wait(1);
}
test.noteOff(60);

await test.make();
