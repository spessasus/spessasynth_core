import { MIDITestMaker } from "../../midi_test_maker";
import { MIDIControllers } from "../../../../src";

const test = new MIDITestMaker("XG Stereo System Effect test", {
    system: "xg"
});

test.init(0, 0, 16, {
    reverbDepth: 0,
    chorusDepth: 127
}).cc(MIDIControllers.pan, 0);

// Chorus input mode defaults to mono
test.text("Regular note").note(60, 127).wait(480);

// CHORUS PARAMETER 15 (input mode = stereo)
test.xg(0x02, 0x01, 0x34, [1]).wait(480);

test.text("Chorus input mode: stereo").note(60, 127).wait(480);

await test.make();
