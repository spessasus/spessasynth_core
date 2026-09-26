import { MIDITestMaker } from "../../midi_test_maker";
import { MIDIControllers } from "../../../../src";

const test = new MIDITestMaker("CC Smoothing Test");

test.init(8, 1, 80);

test.text("Pan Smoothing Test");

let change = 480;
let max = false;

test.noteOn(60, 127);

while (change > 0) {
    test.wait(change).cc(MIDIControllers.pan, max ? 127 : 0);
    max = !max;
    change -= 2;
}

test.cc(MIDIControllers.pan, 64);
test.text("Volume Smoothing Test");

change = 480;
max = false;

while (change > 0) {
    test.wait(change).cc(MIDIControllers.mainVolume, max ? 127 : 0);
    max = !max;
    change -= 2;
}

test.noteOff(60);
await test.make();
