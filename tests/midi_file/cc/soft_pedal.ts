import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers } from "../../../src";

const test = new MIDITestMaker("Soft Pedal Test");

// Sav wave no extra effects
// Capital tone since variation banks seem to not be affected????
test.init(0, 3, 81);

test.text("Soft pedal OFF")
    .cc(MIDIControllers.softPedal, 0)
    .note(60, 127, 480)
    .wait(480)

    .text("Soft pedal ON")
    .cc(MIDIControllers.softPedal, 127)
    .note(60, 127, 480);

await test.make();
