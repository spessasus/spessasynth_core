import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers, RegisteredParameterTypes } from "../../../src";

const test = new MIDITestMaker("XG Controller matrix comparison", {
    system: "xg"
});

// Sine wave, no reverb, max volume and no vibrato
test.init(0, 66, 80);

function sweepXGMatrix(name: string, a3: number, v: number, def = 64) {
    test.text(name)
        .xg(0x08, 0x00, a3, [v])
        .noteOn(60, 127)
        .sweepCC(16, 0, 127, 30)
        .noteOff(60)
        .xg(0x08, 0x00, a3, [def])
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
sweepXGMatrix("AC1 PITCH CONTROL -24 [semitones]", 0x5a, 0x28);
sweepXGMatrix("AC1 PITCH CONTROL +24 [semitones]", 0x5a, 0x58);
sweepXGMatrix("AC1 PITCH CONTROL +64 [semitones]", 0x5a, 127);

// Square wave
test.programChange(0, 1, 80);

test.text("FILTER CONTROL Test");
test.text("CC#74 - baseline (filter, lower half)")
    .noteOn(60, 127)
    .sweepCC(MIDIControllers.brightness, 64, 0, 60)
    .noteOff(60)
    .cc(MIDIControllers.brightness, 64)
    .wait(480);
sweepXGMatrix("AC1 FILTER CONTROL -9600 [cents]", 0x5b, 0);
sweepXGMatrix("AC1 FILTER CONTROL +9450 [cents]", 0x5b, 127);

test.text("CC#74 at lowest")
    .cc(MIDIControllers.brightness, 0)
    .note(60, 127, 480)
    .cc(MIDIControllers.brightness, 64)
    .wait(480);

test.text("AC1 FILTER CONTROL -9600 [cents] at highest")
    .xg(0x08, 0x00, 0x5b, [0])
    .cc(16, 127)
    .note(60, 127, 480)
    .cc(16, 0)
    .xg(0x08, 0x00, 0x5b, [64])
    .wait(480);

// Back to sine wave
test.init(0, 66, 80);
test.text("AMPLITUDE CONTROL Test");
test.text("CC#7 - baseline (square gain)")
    .noteOn(60, 127)
    .sweepCC(MIDIControllers.mainVolume, 0, 127, 60)
    .noteOff(60)
    .wait(480);

sweepXGMatrix("AC1 AMPLITUDE CONTROL -100.0 [%]", 0x5c, 0);
sweepXGMatrix("AC1 AMPLITUDE CONTROL +100.0 [%]", 0x5c, 127);

test.cc(MIDIControllers.mainVolume, 0);
sweepXGMatrix("AC1 AMPLITUDE CONTROL +100.0 [%], CC#7 = 0", 0x5c, 127);
test.cc(MIDIControllers.mainVolume, 127);

test.text("LFO PMOD DEPTH Test");
sweepXGMatrix("AC1 LFO PMOD DEPTH 50 [cents]", 0x5d, 10, 0);
sweepXGMatrix("AC1 LFO PMOG DEPTH 600 [cents]", 0x5d, 127, 0);

// Square wave
test.init(0, 1, 80, {
    brightness: 64
});
test.text("LFO FMOD DEPTH Test");
sweepXGMatrix("AC1 LFO FMOD DEPTH 2400 [cents]", 0x5e, 127, 0);

// Back to sine wave
test.init(0, 66, 80);
test.text("LFO AMOD DEPTH Test");
sweepXGMatrix("AC1 LFO AMOD DEPTH 100 [%]", 0x5f, 127, 0);

await test.make();
