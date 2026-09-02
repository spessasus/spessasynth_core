import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

const test = new MIDITestMaker("GS User Drum Set Test", {
    channel: 9
});

function seq() {
    test.note(36, 127, 0)
        .wait(480)

        .note(38, 127, 0)
        .wait(480)

        .note(40, 127, 0)
        .wait(1280);
}

test.init(0, 3, 64);

test.text("Unchanged");
seq();

test.text("Set user GS drum");
test.gs(0x21, 0x00, 0x00, [...new TextEncoder().encode("Test Drumset")]);
// Note 36:
test.gs(0x21, 0x01, 36, [60]) // PLAY NOTE = -4
    .gs(0x21, 0x02, 36, [127]) // LEVEL = 127
    .gs(0x21, 0x04, 36, [1]) // PAN = 1 (HARD LEFT)
    .gs(0x21, 0x05, 36, [0]) // REVERB = 0
    .gs(0x21, 0x06, 36, [0]) // CHORUS = 0
    .gs(0x21, 0x09, 36, [0]) // DELAY = 0
    .gs(0x21, 0x0a, 36, [1]) // MAP = 1 (SC-55)
    .gs(0x21, 0x0b, 36, [24]) // PROGRAM NUMBER = 24 (ELECTRONIC)
    .gs(0x21, 0x0c, 36, [36]); // SOURCE NOTE NUMBER = 36

// Note 38:
test.gs(0x21, 0x01, 38, [64]) // PLAY NOTE = 0
    .gs(0x21, 0x02, 38, [64]) // LEVEL = 64
    .gs(0x21, 0x04, 38, [64]) // PAN = 64 (UNCHANGED)
    .gs(0x21, 0x05, 38, [127]) // REVERB = 127
    .gs(0x21, 0x06, 38, [127]) // CHORUS = 127
    .gs(0x21, 0x09, 38, [127]) // DELAY = 127
    .gs(0x21, 0x0a, 38, [3]) // MAP = 1 (SC-55)
    .gs(0x21, 0x0b, 38, [25]) // PROGRAM NUMBER = 25 (ANALOG)
    .gs(0x21, 0x0c, 38, [46]); // SOURCE NOTE NUMBER = 46

// Note 40:
test.gs(0x21, 0x01, 40, [40]) // PLAY NOTE = -24
    .gs(0x21, 0x02, 40, [127]) // LEVEL = 127
    .gs(0x21, 0x04, 40, [127]) // PAN = 127 (HARD RIGHT)
    .gs(0x21, 0x05, 40, [0]) // REVERB = 0
    .gs(0x21, 0x06, 40, [0]) // CHORUS = 0
    .gs(0x21, 0x09, 40, [127]) // DELAY = 127
    .gs(0x21, 0x0a, 40, [1]) // MAP = 1 (SC-55)
    .gs(0x21, 0x0b, 40, [0]) // PROGRAM NUMBER = 0 (STANDARD)
    .gs(0x21, 0x0c, 40, [49]); // SOURCE NOTE NUMBER = 49

test.text("Parameters changed, no program change, effects set to MAX")
    .text("The drums should NOT BE MODIFIED (other than effects)")
    .cc(MIDIControllers.reverbDepth, 127)
    .cc(MIDIControllers.chorusDepth, 127)
    .cc(MIDIControllers.variationDepth, 127);

seq();

test.text("Executing a program change")
    .text("The drums should BE MODIFIED")
    .init(0, 0, 64, { chorusDepth: 127, variationDepth: 127 });

seq();

test.text("Binding a drum instrument to itself")
    .gs(0x21, 0x0b, 50, [64]) // PROGRAM NUMBER = 64 (USER DRUM SET 1)
    .gs(0x21, 0x0c, 50, [50]) // SOURCE NOTE NUMBER = 50
    .note(50, 120, 0);
await test.make();
