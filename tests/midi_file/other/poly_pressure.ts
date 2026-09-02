import { MIDIControllers } from "../../../src";
import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("Poly Pressure", {
    tempo: 60
});

test.gs(0x40, 0x21, 0x34, [127])
    .programChange(1, 1, 80)
    .text("None")
    .note(60, 127)
    .wait(480)
    .text("Before note")
    .poly(60, 127)
    .note(60, 127)
    .wait(480)
    .text("Persistent between notes")
    .note(60, 127)
    .poly(60, 0)
    .wait(480)
    .text("While note")
    .noteOn(60, 127)
    .wait(240)
    .poly(60, 127)
    .wait(960)
    .text("CC #121 reset, should set poly to 0")
    .cc(MIDIControllers.resetAllControllers, 0)
    .wait(240)
    .noteOff(60);

await test.make();
