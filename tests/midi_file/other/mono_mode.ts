import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

const test = new MIDITestMaker("Mono Mode Test");

const g = 480;

function noteOn(note: number) {
    if (note > 110) return;

    test.noteOn(note, 100).wait(g / 8);
    noteOn(note + 1);
    test.noteOff(note).wait(g / 8);
}

test.programChange(1, 1, 80)
    .cc(MIDIControllers.monoModeOn, 0)
    .text("Note depth tracking test");

noteOn(30);

test.wait(g * 2);

test.text("Notes going down")
    .noteOn(60, 127)
    .wait(g)
    .noteOn(55, 127)
    .wait(g)
    .noteOn(52, 127);

test.wait(g * 2)
    .noteOff(52)
    .wait(g)
    .noteOff(55)
    .wait(g)
    .noteOff(60);

test.wait(g * 2);

test.text("Notes going out of order")
    .noteOn(60, 127)
    .wait(g)
    .noteOn(55, 127)
    .wait(g)
    .noteOn(52, 127);

test.wait(g * 2)
    .noteOff(60)
    .wait(g)
    .noteOff(52)
    .wait(g)
    .noteOff(55);

test.wait(g * 2);

test.text("Note velocity test")
    .noteOn(60, 30)
    .wait(g)
    .noteOn(64, 50)
    .wait(g)
    .noteOn(69, 127);

test.wait(g * 2)
    .noteOff(69)
    .wait(g)
    .noteOff(64)
    .wait(g)
    .noteOff(60);

test.wait(g * 2);

test.text("Note off not in order test")
    .noteOn(60, 100)
    .wait(g)
    .noteOn(64, 100)
    .wait(g)
    .noteOn(69, 100)
    .wait(g)
    .noteOn(72, 100);

test.wait(g * 2)
    .noteOff(72)
    .wait(g)
    .noteOff(64)
    .wait(g)
    .noteOff(69)
    .wait(g)
    .noteOff(60);

await test.make();
