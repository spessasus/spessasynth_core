import { MIDITestMaker } from "../midi_test_maker";
import { MIDIControllers, NonRegisteredMSB } from "../../../src";

const test = new MIDITestMaker("Drum Key Level test", {
    channel: 9
});

// Analog (pure sine kick almost always)
test.init(0, 1, 25).cc(MIDIControllers.releaseTime, 0);

for (let i = 0; i < 127; i++) {
    test.nrpn((NonRegisteredMSB.drumLevel << 7) | 36, i);
    test.note(36, 127, 60);
}

await test.make();
