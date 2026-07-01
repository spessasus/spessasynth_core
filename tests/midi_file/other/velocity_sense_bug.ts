import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

// Source - https://stackoverflow.com/a/47593316
// Seedable random generator
function splitmix32(a: number) {
    return function () {
        a |= 0;
        a = (a + 0x9e_37_79_b9) | 0;
        let t = a ^ (a >>> 16);
        t = Math.imul(t, 0x21_f0_aa_ad);
        t = t ^ (t >>> 15);
        t = Math.imul(t, 0x73_5a_2d_97);
        return ((t ^ (t >>> 15)) >>> 0) / 4_294_967_296;
    };
}

const prng = splitmix32(81_572);

const test = new MIDITestMaker("Velocity Sense Depth Bug");

test.text(`Depth = ${1000}`)
    .gs(0x40, 0x11, 0x1a, [100])
    .cc(MIDIControllers.reverbDepth, 0);

for (let j = 40; j < 100; j++) {
    test.note(j, 28 + prng() * 100, 120);
}
for (let j = 100; j > 40; j--) {
    test.note(j, 28 + prng() * 100, 120);
}

await test.make();
