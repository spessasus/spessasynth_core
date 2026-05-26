import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

const test = new MIDITestMaker("Overlapping Notes Test");

test.programChange(1, 0, 80)

    .text("Note On Square")
    .noteOn(60, 80)
    .wait(480)

    .programChange(1, 0, 81)

    .text("Note On Saw")
    .noteOn(60, 127)
    .wait(480)
    .text("Note Off Square")
    .noteOff(60)
    .wait(480)
    .text("Note Off Saw")
    .noteOff(60);

test.wait(480);

// Mono mode test
test.text("Mono Mode Test")
    .cc(MIDIControllers.monoModeOn, 0)
    .noteOn(60, 127)
    .wait(480)
    .noteOn(64, 127)
    .wait(480)
    .noteOn(60, 127)
    .wait(480)
    .noteOff(60)
    .wait(480)
    .noteOn(60, 127)
    .wait(480)
    .noteOff(60);

await test.make();
