import { MIDIControllers, RegisteredParameterTypes } from "../../../src";
import { MIDITestMaker } from "../../midi_file/midi_test_maker";
import { runMIDIEditorTest } from "./run_midi_editor_test";

const midi = new MIDITestMaker("MIDI Editor Insertion order", {
    system: "gm"
});

midi.note(50, 127)
    .wait(480)
    .rpn(RegisteredParameterTypes.fineTuning, 16_000)
    .note(64, 127);

midi.flush();

// The event order should match the code, esp. data entries being after registered parameters
runMIDIEditorTest(midi, {
    channels: new Map([
        [
            0,
            {
                fineTune: -40,
                midiParams: {
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
    },
    delayParams: {
        level: 123,
        levelCenter: 34,
        timeRatioRight: 43,
        timeRatioLeft: 54,
        timeCenter: 12,
        feedback: 78,
        levelLeft: 64,
        levelRight: 98,
        preLowpass: 2,
        sendLevelToReverb: 127
    },
    insertionParams: {
        type: 0x30_10,
        params: new Uint8Array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
            20, 64, 120, 127
        ])
    }
});
