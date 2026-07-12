import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("GS Tone Number test");

test.text("Changing to Saw Wave via regular program change").programChange(
    0,
    0,
    81
);

test.note(60, 127, 960).wait(960);

test.text("Changing to Square Wave via TONE NUMBER sysex.").gs(
    0x40,
    0x11,
    0x00,
    [1, 80]
);

test.note(60, 127, 960).wait(960);

await test.make();
