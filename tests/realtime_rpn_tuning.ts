import { MIDITestMaker } from "./test_maker";
import { MIDIControllers } from "../src";

const test = new MIDITestMaker("RPN Tuning Real-time Test");

// MG Square
test.addProgramChange(1, 0, 80);
test.addNoteOn(60, 127);

// Fine-tune
// Real-time
let pitch = 0;
while (pitch < 16_383) {
    test.addControllerChange(MIDIControllers.registeredParameterMSB, 0);
    test.addControllerChange(MIDIControllers.registeredParameterLSB, 1);
    test.addControllerChange(MIDIControllers.dataEntryMSB, pitch >> 7);
    test.addControllerChange(MIDIControllers.dataEntryLSB, pitch & 0x7f);
    test.ticks += 2;
    pitch = Math.min(16_383, pitch + 10);
}
test.addNoteOff(60);

test.ticks += 480;

// Coarse-tune
// Should be treated as non-realtime (key shift)
test.addNoteOn(60, 127);
pitch = 64;
while (pitch < 88) {
    pitch++;
    test.addControllerChange(MIDIControllers.registeredParameterMSB, 0);
    test.addControllerChange(MIDIControllers.registeredParameterLSB, 2);
    test.addControllerChange(MIDIControllers.dataEntryMSB, pitch);
    test.ticks += 480;
}
test.addNoteOff(60);

test.make();
