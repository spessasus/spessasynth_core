import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers, RegisteredParameterTypes } from "../../../src";

const test = new MIDITestMaker("GS Controller matrix comparison");

// Sine wave, no reverb, max volume and no vibrato
test.init(8, 1, 80, {
    // Sine wave seems to have a filter in SC which changes volume with pitch, fix that here
    brightness: 127
});

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
test.text("Pitch Wheel - baseline")
    .rpn(0, 24 << 7)
    .noteOn(60, 127)
    .sweepPitch(0, 8192, 1, 2)
    .noteOff(60)
    .wait(480)
    .noteOn(60, 127)
    .sweepPitch(8192, 16_383, 1, 2)
    .noteOff(60)
    .pitch(8192)
    .rpn(RegisteredParameterTypes.pitchWheelRange, 2 << 7)
    .wait(480);
sweepGSMatrix("CC1 PITCH CONTROL -24 [semitones]", 0x40, 0x28);
sweepGSMatrix("CC1 PITCH CONTROL +24 [semitones]", 0x40, 0x58);
sweepGSMatrix("CC1 PITCH CONTROL +64 [semitones]", 0x40, 127);

// Square wave
test.programChange(1, 1, 80);

test.text("TVF CONTROL Test");
test.text("CC#74 - baseline (filter, lower half)")
    .noteOn(60, 127)
    .sweepCC(MIDIControllers.brightness, 64, 0, 60)
    .noteOff(60)
    .cc(MIDIControllers.brightness, 64)
    .wait(480);
sweepGSMatrix("CC1 TVF CONTROL -9600 [cents]", 0x41, 0);
sweepGSMatrix("CC1 TVF CONTROL +9600 [cents]", 0x41, 127);

test.text("CC#74 at lowest")
    .cc(MIDIControllers.brightness, 0)
    .note(60, 127, 480)
    .cc(MIDIControllers.brightness, 64)
    .wait(480);

test.text("CC1 TVF CONTROL -9600 [cents] at highest")
    .gs(0x40, 0x21, 0x41, [0])
    .cc(16, 127)
    .note(60, 127, 480)
    .cc(16, 0)
    .gs(0x40, 0x21, 0x41, [64])
    .wait(480);

// Back to sine wave
test.init(8, 1, 80, {
    brightness: 127
});
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
test.cc(MIDIControllers.mainVolume, 127);

test.text("LFO1 PITCH DEPTH Test");
sweepGSMatrix("CC1 LFO1 PITCH DEPTH 50 [cents]", 0x44, 10);
sweepGSMatrix("CC1 LFO1 PITCH DEPTH 600 [cents]", 0x44, 127);

await test.make();
