import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";
import { randomGenerator } from "../../../src/utils/other";

const test = new MIDITestMaker("Velocity Sense Depth Bug");

test.text(`Depth = ${1000}`)
    .gs(0x40, 0x11, 0x1a, [100])
    .cc(MIDIControllers.reverbDepth, 0);

for (let j = 40; j < 100; j++) {
    test.note(j, 28 + randomGenerator() * 100, 120);
}
for (let j = 100; j > 40; j--) {
    test.note(j, 28 + randomGenerator() * 100, 120);
}

await test.make();
