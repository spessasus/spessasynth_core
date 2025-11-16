import { MIDIBuilder } from "../src";

const mid = new MIDIBuilder({
    format: 1
});
mid.addNewTrack("TEST");
mid.addNoteOn(0, 1, 0, 64, 120);
mid.addNoteOff(200, 1, 0, 64);
mid.flush();
mid.writeMIDI();
console.info("Succesfully created a simple test file");
