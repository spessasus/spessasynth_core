import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("GS Delay Level");

// No feedback
test.gs(0x40, 0x01, 0x59, [64]);

// SC-55 sine
test.init(8, 1, 80, { brightness: 127, variationDepth: 127 });

let level = 0;
while (level <= 128) {
    test.text(`Level = ${level}`)
        .gs(0x40, 0x01, 0x58, [Math.min(127, level)])
        .wait(120)
        .noteOn(60, 127)
        .wait(40)
        .noteOff(60)
        .wait(480);
    level += 8;
}

await test.make();
