import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

const test = new MIDITestMaker("Insertion FX Effect Sends");

// SC-55 sine
test.init(8, 1, 80, { brightness: 127, variationDepth: 127 });

// Play short note
test.wait(60).noteOn(60, 127).wait(60).noteOff(60).wait(960);

// EFX
const fx = test.efx(0, 0);
fx.setParam(0x19, 127);

// Play short note
test.wait(60).noteOn(60, 127).wait(60).noteOff(60).wait(960);

// Mark end
test.cc(MIDIControllers.variationDepth, 0);

await test.make();
