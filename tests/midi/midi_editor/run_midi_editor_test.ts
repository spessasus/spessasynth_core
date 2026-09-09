import { SpessaLog, type ModifyMIDIOptions } from "../../../src";
import type { MIDITestMaker } from "../../midi_file/midi_test_maker";
import { logEventsTest } from "./log_events";

export function runMIDIEditorTest(
    test: MIDITestMaker,
    opts: ModifyMIDIOptions
) {
    console.info("\n\n\n--- BEFORE ---");
    logEventsTest(test);
    SpessaLog.setLogLevel(true, true, true);
    test.modify(opts);
    console.info("\n\n\n--- AFTER ---");
    logEventsTest(test);
}
