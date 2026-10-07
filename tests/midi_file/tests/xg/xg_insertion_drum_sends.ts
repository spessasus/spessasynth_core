import { MIDITestMaker } from "../../midi_test_maker";
import { MIDIControllers } from "../../../../src";

const test = new MIDITestMaker("XG Insertion Drum Sends Test", {
    system: "xg",
    channel: 9
});

test.text("Reverb return = 64");
test.xg(0x02, 0x01, 0x0c, [64]);

test.text("Kick reverb send = 0, snare reverb send = 127");
test.xg(0x30, 36, 0x05, [0]);
test.xg(0x30, 38, 0x05, [127]);
test.cc(MIDIControllers.reverbDepth, 127);
test.cc(MIDIControllers.mainVolume, 127);

test.text("Variation type = DELAY L,C,R, 700 ms");
test.xg(0x02, 0x01, 0x40, [0x05, 0x00]);
// Lch = Rch = Cch delay = 7000 (700 ms): MSB = 7000 >> 7 = 54, LSB = 88
test.xg(0x02, 0x01, 0x42, [0x36, 0x58]);
test.xg(0x02, 0x01, 0x44, [0x36, 0x58]);
test.xg(0x02, 0x01, 0x46, [0x36, 0x58]);
// Feedback level = 96 (strong repeats), Dry/Wet = 80
test.xg(0x02, 0x01, 0x4a, [0x00, 0x60]);
test.xg(0x02, 0x01, 0x54, [0x00, 0x50]);

test.text("Case 1: normal, kick then snare");
test.note(36, 120).wait(960).note(38, 120).wait(1440);

test.text("Case 2: variation insertion on channel 9");
test.xg(0x02, 0x01, 0x5a, [0]); // Connection = insertion
test.xg(0x02, 0x01, 0x5b, [9]); // Variation part = channel 9
test.wait(480); // Give it some time to process
test.note(36, 120).wait(960).note(38, 120).wait(1440);

// Release the variation block again
test.text("Variation part OFF");
test.xg(0x02, 0x01, 0x5b, [127]);

test.text("Case 3: normal again");
test.note(36, 120).wait(960).note(38, 120).wait(1440);

test.text("Case 4: solo kick under insertion");
test.xg(0x02, 0x01, 0x5b, [9]); // Variation part = channel 9
test.note(36, 120).wait(1440).note(36, 120).wait(1440);
test.text("Variation part OFF");
test.xg(0x02, 0x01, 0x5b, [127]);

await test.make();
