import { MIDIControllers } from "../../../src";
import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("GS Chorus Rate");

// Chorus3
test.gs(0x40, 0x01, 0x38, [2])
    // Feedback
    .gs(0x40, 0x01, 0x3b, [0])
    // Delay
    .gs(0x40, 0x01, 0x3c, [0])
    // Depth
    .gs(0x40, 0x01, 0x3e, [127])
    .cc(MIDIControllers.reverbDepth, 0)
    .cc(MIDIControllers.chorusDepth, 127)
    // SC-55 MAP square wave
    .programChange(1, 1, 80);

let rate = 0;
while (rate <= 128) {
    // Rate
    test.text(`Rate = ${rate}`)
        .gs(0x40, 0x01, 0x3d, [Math.min(127, rate)])
        .wait(80)
        .noteOn(60, 120)
        .wait(960)
        .noteOff(60);
    rate += 1;
}

await test.make();
