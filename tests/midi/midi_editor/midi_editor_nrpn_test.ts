import {
    MIDIControllers,
    NonRegisteredParameterTypesLSB,
    NonRegisteredParameterTypesMSB
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
    .cc(pLSB, NonRegisteredParameterTypesLSB.tvfCutoffFrequency)
    .cc(pMSB, NonRegisteredParameterTypesMSB.partParameter);

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
test.cc(pLSB, NonRegisteredParameterTypesLSB.tvfCutoffFrequency)
    .switchChannel(1)
    .cc(pLSB, NonRegisteredParameterTypesLSB.tvfCutoffFrequency)
    .switchChannel(0)
    .cc(pMSB, NonRegisteredParameterTypesMSB.partParameter)
    .switchChannel(1)
    .cc(pMSB, NonRegisteredParameterTypesMSB.partParameter)
    .switchChannel(0)
    .note(61, 127)
    .cc(dMSB, 60)
    .switchChannel(1)

    .note(61, 127)
    .cc(dMSB, 61)
    .switchChannel(0);

const drumLevel = NonRegisteredParameterTypesMSB.drumLevel;
test.switchChannel(9);

// Shared NRPN MSB, kept then cleared
// Expect: MSB, LSB 36, Data 100 (the MSB stays, key 36 needs it)
test.cc(pMSB, drumLevel)
    .cc(pLSB, 36)
    .cc(dMSB, 100)
    .cc(pLSB, 38)
    .cc(dMSB, 50)
    .note(36, 127);

// Shared NRPN MSB, cleared then kept
// Expect: LSB 42, MSB (restored),
// Data 51 (the MSB is reinserted since key 42 needs it)
test.cc(pMSB, drumLevel)
    .cc(pLSB, 40)
    .cc(dMSB, 101)
    .cc(pLSB, 42)
    .cc(dMSB, 51)
    .note(36, 127);

// RPN selection between a kept and a cleared NRPN
// As RPN and NRPN selections are separate
// Expect: MSB, LSB 46, Data 102,
// RPN MSB 0 (the NRPN MSB stays, key 46 needs it)
test.cc(pMSB, drumLevel)
    .cc(pLSB, 46)
    .cc(dMSB, 102)
    .cc(MIDIControllers.registeredParameterMSB, 0)
    .cc(pLSB, 44)
    .cc(dMSB, 52)
    .note(36, 127);

// Unrecognized NRPN kept after a cleared one
// Expect: MSB 0x7E, LSB 40 (restored),
// Data 5 (the LSB is reinserted, the unknown parameter needs it)
test.cc(pMSB, drumLevel)
    .cc(pLSB, 40)
    .cc(dMSB, 103)
    .cc(pMSB, 0x7e)
    .cc(dMSB, 5)
    .note(36, 127);

// The editor's inserted parameters change the selection, so we must restore it.
// The file's selection is restored right before the next
// Data entry relying on it, only once.
const vibratoRate = NonRegisteredParameterTypesLSB.vibratoRate;
const partParameter = NonRegisteredParameterTypesMSB.partParameter;

// Inserted RPN before a file's LSB-only NRPN
// Expect: ..., (inserted RPN), Note, NRPN MSB,
// NRPN LSB (both restored), Data 71, Data 72
test.switchChannel(2)
    .cc(pMSB, partParameter)
    .cc(pLSB, vibratoRate)
    .cc(dMSB, 70)
    .note(60, 127)
    .cc(dMSB, 71)
    .cc(dMSB, 72);

// Inserted RPN between data entry MSB and LSB
// Expect: ..., (inserted RPN), Note, NRPN MSB, NRPN LSB,
// Data MSB 70 (all restored), Data LSB 5
// (A selection resets the data MSB)
test.switchChannel(3)
    .cc(pMSB, partParameter)
    .cc(pLSB, vibratoRate)
    .cc(dMSB, 70)
    .note(60, 127)
    .cc(dLSB, 5);

// Inserted RPN, nothing uses the selection after
// Expect: ..., (inserted RPN), Note (nothing restored)
test.switchChannel(4)
    .cc(pMSB, partParameter)
    .cc(pLSB, vibratoRate)
    .cc(dMSB, 70)
    .note(60, 127);

// Inserted RPN, then Reset All Controllers sets the selection to null
// Expect: ..., (inserted RPN), Note,
// Reset All Controllers, Data 71 (nothing restored)
test.switchChannel(5)
    .cc(pMSB, partParameter)
    .cc(pLSB, vibratoRate)
    .cc(dMSB, 70)
    .note(60, 127)
    .cc(MIDIControllers.resetAllControllers, 0)
    .cc(dMSB, 71);

test.switchChannel(0);
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
        ],
        [2, { midiParams: { modulationDepth: 0 } }],
        [3, { midiParams: { modulationDepth: 0 } }],
        [4, { midiParams: { modulationDepth: 0 } }],
        [5, { midiParams: { modulationDepth: 0 } }],
        [
            9,
            {
                drumParams: new Map([
                    [38, "clear"],
                    [40, "clear"],
                    [44, "clear"]
                ])
            }
        ]
    ])
});
