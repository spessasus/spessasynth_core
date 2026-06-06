import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

const test = new MIDITestMaker("GS Patch Common Parameters");

// Sine wave, no reverb
test.programChange(8, 1, 80).cc(MIDIControllers.reverbDepth, 0);

test.text("MASTER TUNE");

for (let tune = -100; tune <= 100; tune += 20) {
    test.setGlobalMIDIParameter("fineTune", tune)
        .text(`Fine tune = ${tune} cents`)
        .note(60, 120, 120)
        .wait(120);
}
test.setGlobalMIDIParameter("fineTune", 0);

test.wait(960).text("MASTER VOLUME");

test.noteOn(60, 127);

for (let volume = 0; volume <= 127; volume += 1) {
    test.setGlobalMIDIParameter("volume", volume / 127)
        .text(`Master volume = ${volume}`)
        .wait(20);
}
test.noteOff(60);
test.setGlobalMIDIParameter("volume", 1);

test.wait(960).text("MASTER KEY-SHIFT");

for (let shift = -24; shift <= 24; shift += 6) {
    test.setGlobalMIDIParameter("keyShift", shift)
        .text(`Key shift = ${shift} semitones`)
        .note(60, 120, 120)
        .wait(120);
}
test.setGlobalMIDIParameter("keyShift", 0);

test.wait(960).text("MASTER PAN");

for (let pan = -100; pan <= 100; pan += 10) {
    test.setGlobalMIDIParameter("pan", pan / 100)
        .text(`Pan = ${pan}`)
        .note(60, 120, 120)
        .wait(120);
}
test.setGlobalMIDIParameter("pan", 0);

await test.make();
