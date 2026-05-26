import { MIDITestMaker } from "./test_maker";
import { MIDIControllers } from "../src";

const test = new MIDITestMaker("Overlapping Notes Test");

// Square
test.programChange(1, 0, 80);

test.noteOn(60, 80);
test.ticks += 480;

// Saw
test.programChange(1, 0, 81);
test.noteOn(60, 127);
test.ticks += 480;
test.noteOff(60);
test.ticks += 480;
test.noteOff(60);

// Mono mode test
test.ticks += 480;
test.cc(MIDIControllers.monoModeOn, 0);
test.noteOn(60, 127);
test.ticks += 480;
test.noteOn(64, 127);
test.ticks += 480;
test.noteOn(60, 127);
test.ticks += 480;
test.noteOff(60);
test.ticks += 480;
test.noteOn(60, 127);
test.ticks += 480;
test.noteOff(60);

// End
test.ticks += 1920;
test.cc(1, 1);
test.make();
