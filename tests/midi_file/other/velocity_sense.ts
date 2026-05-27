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
        .note(60, 127, 240);
}

test.text("Regular velocity sweep, Depth = 64, Offset = 64");
velocitySweep();
test.wait(480);

test.text("Velocity Depth = 0");
test.gs(0x40, 0x11, 0x1a, [0]);
velocitySweep();
test.wait(480);

test.text("Velocity Depth = 32");
test.gs(0x40, 0x11, 0x1a, [32]);
velocitySweep();
test.wait(480);

test.text("Velocity Depth = 96");
test.gs(0x40, 0x11, 0x1a, [96]);
velocitySweep();
test.wait(480);

test.text("Velocity Depth = 127");
test.gs(0x40, 0x11, 0x1a, [127]);
velocitySweep();
test.wait(480);

await test.make();
