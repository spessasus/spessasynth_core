import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("RPN Tuning Real-time Test");

// MG Square
test.programChange(1, 0, 80).noteOn(60, 127);

test.text("Real-Time Fine Tuning");
let pitch = 0;
while (pitch < 16_383) {
    test.rpn(1, pitch).wait(2);
    pitch = Math.min(16_383, pitch + 10);
}
test.noteOff(60).wait(480);

// Piano 1
test.programChange(0, 0, 0).noteOn(60, 127);

test.text("Coarse-tune: should be treated as non-realtime (key shift)");
pitch = 64;
while (pitch < 88) {
    test.rpn(2, pitch << 7)
        .noteOff(60)
        .noteOn(60, 127)
        .wait(480);
    pitch++;
}
test.noteOff(60);

await test.make();
