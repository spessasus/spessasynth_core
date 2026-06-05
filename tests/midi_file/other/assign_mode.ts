import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("Assign Mode Test", {
    channel: 0
});
// Celesta (long fade)
test.programChange(0, 0, 8);

const n = 60;

test.text("Assign Mode: Full Multi")
    .setChannelMIDIParameter("assignMode", 2)
    .note(n, 120, 60)
    .note(n, 1, 60)
    .wait(960);

test.text("Assign Mode: Limited Multi")
    .setChannelMIDIParameter("assignMode", 1)
    .note(n, 120, 60)
    .note(n, 1, 60)
    .wait(960);

test.text("Assign Mode: Single")
    .setChannelMIDIParameter("assignMode", 0)
    .note(n, 120, 60)
    .note(n, 1, 60)
    .wait(960);

test.reset("xg").text("XG Version testing");

// Celesta (long fade)
test.programChange(0, 0, 8);

test.text("SAME NOTE NUMBER KEY ON ASSIGN: INST")
    .xg(0x08, 0, 0x06, [2])
    .note(n, 120, 60)
    .note(n, 1, 60)
    .wait(960);

test.text("SAME NOTE NUMBER KEY ON ASSIGN: MULTI")
    .xg(0x08, 0, 0x06, [1])
    .note(n, 120, 60)
    .note(n, 1, 60)
    .wait(960);

test.text("SAME NOTE NUMBER KEY ON ASSIGN: SINGLE")
    .xg(0x08, 0, 0x06, [0])
    .note(n, 120, 60)
    .note(n, 1, 60)
    .wait(960);

await test.make();
