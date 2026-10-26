import type { BasicMIDI } from "../../basic_midi";
import type { IndexedByteArray } from "../../../utils/indexed_array";
import type { TrackerModule } from "./tracker_module";
import { ProTrackerModule } from "./protracker";
import { FastTrackerModule } from "./fasttracker";
import { ScreamTrackerModule } from "./screamtracker";

/**
 * Detects a tracker module and converts it into the given MIDI.
 * @param outputMIDI The MIDI to populate.
 * @param binary The file data.
 * @param fileName The file name.
 * @returns True if the file was a tracker module, false otherwise.
 */
export function loadTrackerModule(
    outputMIDI: BasicMIDI,
    binary: IndexedByteArray,
    fileName: string
) {
    let module: TrackerModule;
    if (FastTrackerModule.isXM(binary)) {
        module = new FastTrackerModule();
    } else if (ScreamTrackerModule.isS3M(binary)) {
        module = new ScreamTrackerModule();
    } else if (ProTrackerModule.getChannelCount(binary) > 0) {
        module = new ProTrackerModule();
    } else {
        return false;
    }
    module.parse(binary);
    module.toMIDI(outputMIDI, fileName);
    return true;
}
