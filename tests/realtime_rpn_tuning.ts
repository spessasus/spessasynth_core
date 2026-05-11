import { MIDITestMaker } from "./test_maker";

const test = new MIDITestMaker("RPN Tuning Real-time Test");

// MG Square
test.programChange(1, 0, 80);
test.noteOn(60, 127);

// Fine-tune
// Real-time
let pitch = 0;
while (pitch < 16_383) {
    test.rpn(1, pitch);
    test.ticks += 2;
    pitch = Math.min(16_383, pitch + 10);
}
test.noteOff(60);

test.ticks += 480;

// Coarse-tune
// Should be treated as non-realtime (key shift)
test.noteOn(60, 127);
pitch = 64;
while (pitch < 88) {
    test.noteOff(60);
    test.rpn(2, pitch << 7);
    test.noteOn(60, 127);
    pitch++;
    test.ticks += 480;
}
test.noteOff(60);

test.make();
