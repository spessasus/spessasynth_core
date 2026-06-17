import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

// TODO: Finish
const test = new MIDITestMaker("GS Controller matrix comparison");

// Sine wave, no reverb, max volume and no vibrato
test.programChange(8, 1, 80)
    .cc(MIDIControllers.reverbDepth, 0)
    .cc(MIDIControllers.mainVolume, 127)
    .cc(MIDIControllers.vibratoDepth, 0);

function sweepGSMatrix(name: string, a3: number, v: number) {
    test.text(name)
        .gs(0x40, 0x21, a3, [v])
        .noteOn(60, 127)
        .sweepCC(16, 0, 127, 30)
        .noteOff(60)
        .gs(0x40, 0x21, a3, [64])
        .cc(16, 0)
        .wait(480);
}

test.text("PITCH CONTROL Test");
sweepGSMatrix("CC1 PITCH CONTROL -24 [semitones]", 0x40, 0x28);
sweepGSMatrix("CC1 PITCH CONTROL +24 [semitones]", 0x40, 0x58);
sweepGSMatrix("CC1 PITCH CONTROL +64 [semitones]", 0x40, 127);

// Square wave
test.programChange(1, 1, 80);

test.text("TVF CONTROL Test");
test.text("CC#74 - baseline (filter, lower half)")
    .noteOn(60, 127)
    .sweepCC(MIDIControllers.brightness, 0, 64, 60)
    .noteOff(60)
    .cc(MIDIControllers.brightness, 64)
    .wait(480);
sweepGSMatrix("CC1 TVF CONTROL -9600 [cent]", 0x41, 0);
sweepGSMatrix("CC1 TVF CONTROL +9600 [cent]", 0x41, 127);

test.text("CC#74 at lowest")
    .cc(MIDIControllers.brightness, 0)
    .note(60, 127, 480)
    .cc(MIDIControllers.brightness, 64)
    .wait(480);

test.text("CC1 TVF CONTROL -9600 [cent] at highest")
    .gs(0x40, 0x21, 0x41, [0])
    .cc(16, 127)
    .note(60, 127, 480)
    .cc(16, 0)
    .gs(0x40, 0x21, 0x41, [64])
    .wait(480);

// Back to sine wave
test.programChange(8, 1, 80);
test.text("AMPLITUDE CONTROL Test");
test.text("CC#7 - baseline (square gain)")
    .noteOn(60, 127)
    .sweepCC(MIDIControllers.mainVolume, 0, 127, 60)
    .noteOff(60)
    .wait(480);

sweepGSMatrix("CC1 AMPLITUDE CONTROL -100.0 [%]", 0x42, 0);
sweepGSMatrix("CC1 AMPLITUDE CONTROL +100.0 [%]", 0x42, 127);

test.cc(MIDIControllers.mainVolume, 0);
sweepGSMatrix("CC1 AMPLITUDE CONTROL +100.0 [%], CC#7 = 0", 0x42, 127);

await test.make();
