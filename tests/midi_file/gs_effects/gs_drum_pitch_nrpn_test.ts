import { MIDIControllers } from "../../../src";
import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("GS Drum Pitch NRPN Test", {
    channel: 9
});

let MIDI_NOTE = 50;

test.cc(MIDIControllers.reverbDepth, 0);
// SC-88Pro MAP STANDARD
test.programChange(0, 3, 0);

test.text("88Pro MAP STANDARD");
let pitch = 50;
while (pitch <= 70) {
    test.text(`Pitch = ${pitch}`)
        .nrpn((0x18 << 7) | MIDI_NOTE, pitch)
        .cc(MIDIControllers.dataEntryMSB, pitch)
        .wait(240)
        .noteOn(MIDI_NOTE, 120)
        .wait(80)
        .noteOff(MIDI_NOTE);
    pitch += 1;
}

test.wait(480);

MIDI_NOTE = 48; // The same tom pitch compared to 88Pro
// SC-55 MAP STANDARD
test.programChange(0, 1, 0).wait(480);

test.text("SC-55 MAP STANDARD");
pitch = 50;
while (pitch <= 70) {
    test.text(`Pitch = ${pitch}`)
        .nrpn((0x18 << 7) | MIDI_NOTE, pitch)
        .wait(240)
        .noteOn(MIDI_NOTE, 120)
        .wait(80)
        .noteOff(MIDI_NOTE);
    pitch += 1;
}

await test.make();
