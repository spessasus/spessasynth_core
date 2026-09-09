import {
    MIDIControllers,
    NonRegisteredLSB,
    NonRegisteredMSB
} from "../../../src";
import { MIDITestMaker } from "../../midi_file/midi_test_maker";
import { runMIDIEditorTest } from "./run_midi_editor_test";

const test = new MIDITestMaker("MIDI Editor NRPN test");

const pLSB = MIDIControllers.nonRegisteredParameterLSB;
const pMSB = MIDIControllers.nonRegisteredParameterMSB;
const dLSB = MIDIControllers.dataEntryLSB;
const dMSB = MIDIControllers.dataEntryMSB;

// Add manually

test.noteOn(60, 127)
    .cc(pLSB, NonRegisteredLSB.tvfCutoffFrequency)
    .cc(pMSB, NonRegisteredMSB.partParameter);

// Data entry spam: msb -> lsb
for (let index = 0; index < 5; index++) {
    test.cc(dMSB, index + 50).cc(dLSB, 0);
}

// Data entry spam + interleaved notes: lsb -> msb
for (let index = 0; index < 5; index++) {
    test.cc(dLSB, 0)
        .note(61, 127)
        .cc(dMSB, index + 50);
}

// Data entry spam + interleaved notes: msb only
for (let index = 0; index < 5; index++) {
    test.cc(dMSB, index + 50).note(61, 127);
}

// Interleaved NRPN between channels
test.cc(pLSB, NonRegisteredLSB.tvfCutoffFrequency)
    .switchChannel(1)
    .cc(pLSB, NonRegisteredLSB.tvfCutoffFrequency)
    .switchChannel(0)
    .cc(pMSB, NonRegisteredMSB.partParameter)
    .switchChannel(1)
    .cc(pMSB, NonRegisteredMSB.partParameter)
    .switchChannel(0)
    .note(61, 127)
    .cc(dMSB, 60)
    .switchChannel(1)

    .note(61, 127)
    .cc(dMSB, 61)
    .switchChannel(0);

test.noteOff(60).flush();
runMIDIEditorTest(test, {
    channels: new Map([
        [
            0,
            {
                controllers: new Map([[MIDIControllers.brightness, 20]])
            }
        ],
        [
            1,
            {
                controllers: new Map([[MIDIControllers.brightness, 30]])
            }
        ]
    ])
});
