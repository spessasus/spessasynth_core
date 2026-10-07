import { MIDIControllers } from "../../../src";
import { MIDITestMaker } from "../../midi_file/midi_test_maker";
import { runMIDIEditorTest } from "./run_midi_editor_test";

const test = new MIDITestMaker("RPN Fine Tuning Test");

// SC-55 Sine
test.programChange(8, 0, 80);

test.text("Fine Tuning");
let pitch = 0;
while (pitch < 16_383) {
    test.rpn(1, pitch).note(60, 120, 120).wait(120);
    pitch = Math.min(16_383, pitch + 250);
}

// Split rpn: params -> MSB -> note -> LSB.
// This should generate a separate RPN for before note and after note.
test.text("Split RPN: params -> MSB -> note -> LSB");
for (const splitPitch of [250, 4600, 16_383]) {
    test.cc(MIDIControllers.registeredParameterMSB, 0)
        .cc(MIDIControllers.registeredParameterLSB, 1)
        .cc(MIDIControllers.dataEntryMSB, splitPitch >> 7)
        .note(60, 120, 120)
        .wait(120)
        .cc(MIDIControllers.dataEntryLSB, splitPitch & 0x7f)
        .wait(120);
}

test.flush();

runMIDIEditorTest(test, {
    channels: new Map([
        [
            0,
            {
                // Test handling relative tuning editing
                fineTune: -56
            }
        ]
    ])
});
