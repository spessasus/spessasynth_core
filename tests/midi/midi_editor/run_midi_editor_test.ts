import { type ModifyMIDIOptions, SpessaLog } from "../../../src";
import type { MIDITestMaker } from "../../midi_file/midi_test_maker";
import { logEventsTest } from "./log_events";

export function runMIDIEditorTest(
    test: MIDITestMaker,
    opts: ModifyMIDIOptions,
    showModifyLogs = false
) {
    console.info("\n\n--- BEFORE ---");
    logEventsTest(test);
    if (showModifyLogs) SpessaLog.setLogLevel(true, true, true);

    test.modify(opts);
    console.info("\n\n--- AFTER ---");
    logEventsTest(test);
}
