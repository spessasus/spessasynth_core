import {
    MIDIControllers,
    NonRegisteredLSB,
    NonRegisteredMSB
} from "../../../src";
import { MIDITestMaker } from "../../midi_file/midi_test_maker";
import { runMIDIEditorTest } from "./run_midi_editor_test";

const test = new MIDITestMaker("MIDI Editor NRPN test");

// Add manually

test.noteOn(60, 127)
    .cc(
        MIDIControllers.nonRegisteredParameterLSB,
        NonRegisteredLSB.tvfCutoffFrequency
    )
    .cc(
        MIDIControllers.nonRegisteredParameterMSB,
        NonRegisteredMSB.partParameter
    );

// Data entry spam: msb -> lsb
for (let index = 0; index < 5; index++) {
    test.cc(MIDIControllers.dataEntryMSB, index + 50).cc(
        MIDIControllers.dataEntryLSB,
        0
    );
}

// Data entry spam + interleaved notes: lsb -> msb
for (let index = 0; index < 5; index++) {
    test.cc(MIDIControllers.dataEntryLSB, 0)
        .note(61, 127)
        .cc(MIDIControllers.dataEntryMSB, index + 50);
}

// Data entry spam + interleaved notes: msb only
for (let index = 0; index < 5; index++) {
    test.cc(MIDIControllers.dataEntryMSB, index + 50).note(61, 127);
}

test.noteOff(60).flush();
runMIDIEditorTest(test, {
    channels: new Map([
        [
            0,
            {
                controllers: new Map([[MIDIControllers.brightness, 20]])
            }
        ]
    ])
});
