import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

const test = new MIDITestMaker("Velocity Sense Depth + Offset");

test.cc(MIDIControllers.reverbDepth, 0).programChange(8, 1, 80);

function velocitySweep() {
    test.note(60, 1, 240)
        .wait(120)
        .note(60, 16, 240)
        .wait(120)
        .note(60, 32, 240)
        .wait(120)
        .note(60, 48, 240)
        .wait(120)
        .note(60, 64, 240)
        .wait(120)
        .note(60, 80, 240)
        .wait(120)
        .note(60, 96, 240)
        .wait(120)
        .note(60, 112, 240)
        .wait(120)
        .note(60, 127, 240)
        .wait(480);
}

function senseTest(depth: number, offset: number) {
    test.text(`Depth = ${depth}, Offset = ${offset}`)
        .gs(0x40, 0x11, 0x1a, [depth])
        .gs(0x40, 0x11, 0x1b, [offset]);
    velocitySweep();
}

test.text("Regular velocity sweep");
velocitySweep();
test.wait(480);

test.text("Velocity Sense Depth Test");
senseTest(0, 64);
senseTest(32, 64);
senseTest(96, 64);
senseTest(127, 64);
test.wait(480);

test.text("Velocity Sense Offset Test");
senseTest(64, 0);
senseTest(64, 32);
senseTest(64, 96);
senseTest(64, 127);
test.wait(480);

test.text("Testing both");
senseTest(32, 54);
senseTest(92, 13);
senseTest(120, 3);

await test.make();
