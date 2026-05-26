import { MIDIBuilder } from "../../src";

const mid = new MIDIBuilder({
    format: 1
});
mid.addTrack("TEST");
mid.noteOn(0, 1, 0, 64, 120);
mid.noteOff(200, 1, 0, 64);
mid.flush();
mid.writeMIDI();
console.info("Succesfully created a simple test file");
