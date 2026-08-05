import { MIDIControllers } from "../../../src";
import { MIDITestMaker } from "../../midi_file/midi_test_maker";
import { logEventsTest } from "./log_events";

// TODO: Implement this in MIDI editor after confirming no regresions
const test = new MIDITestMaker("Reset All Controllers MIDI Editor Handling");
test.text("This test checks if the MIDI editor correctly handles CC#121");

test.programChange(1, 1, 80);

test.text("Pitch bend")
    .pitch(12_345)
    .note(60, 127)
    .text("Expression")
    .cc(MIDIControllers.expression, 64)
    .note(60, 127)
    .text("Channel pressure")
    .pressure(127)
    .note(60, 127)
    .wait(960);

test.text("Reset all controllers, editor should re-insert the messages needed")
    .cc(MIDIControllers.resetAllControllers, 0)
    .wait(480)
    .note(60, 127, 960);

test.flush();

test.modify({
    channels: new Map([
        [
            0,
            {
                controllers: new Map([
                    [MIDIControllers.expression, 80],
                    [MIDIControllers.mainVolume, 30]
                ]),
                midiParams: {
                    pitchWheel: 432,
                    pressure: 12
                }
            }
        ]
    ])
});

logEventsTest(test);
