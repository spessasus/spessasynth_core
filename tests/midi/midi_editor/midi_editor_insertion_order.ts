import { MIDITestMaker } from "../../midi_file/midi_test_maker";
import { MIDIControllers, MIDIMessage, SpessaLog } from "../../../src";
import { logEventsTest } from "./log_events";

const midi = new MIDITestMaker("MIDI Editor Insertion order", {
    system: "gm"
});

midi.note(50, 127).wait(480).note(64, 127);

midi.flush();

SpessaLog.setLogLevel(true, true, true);

// The event order should match the code, esp. data entries being after registered parameters
midi.modify({
    channels: new Map([
        [
            0,
            {
                midiParams: {
                    fineTune: -40,
                    modulationDepth: 40,
                    pitchWheel: 432,
                    pressure: 12
                },
                controllers: new Map([
                    [MIDIControllers.mainVolume, 69],
                    [MIDIControllers.mainVolumeLSB, 53]
                ]),
                patch: {
                    bankMSB: 0,
                    bankLSB: 3,
                    program: 16,
                    isGMGSDrum: true
                }
            }
        ]
    ]),
    chorusParams: {
        level: 120,
        feedback: 45,
        preLowpass: 2,
        rate: 34,
        delay: 65,
        depth: 127,
        sendLevelToDelay: 0,
        sendLevelToReverb: 40
    },
    reverbParams: {
        level: 120,
        character: 1,
        delayFeedback: 45,
        preDelayTime: 76,
        preLowpass: 2,
        time: 64
    }
});
logEventsTest(midi.tracks[0].events as MIDIMessage[]);
