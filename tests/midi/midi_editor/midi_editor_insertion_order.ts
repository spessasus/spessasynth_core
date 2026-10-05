import {
    MIDIControllers,
    NonRegisteredParameterTypesMSB,
    RegisteredParameterTypes
} from "../../../src";
import { MIDITestMaker } from "../../midi_file/midi_test_maker";
import { runMIDIEditorTest } from "./run_midi_editor_test";

// GM checks replacement behavior
const midi = new MIDITestMaker("MIDI Editor Insertion order", {
    system: "gm"
});

midi.note(50, 127)
    .wait(480)
    .rpn(RegisteredParameterTypes.fineTuning, 16_000)
    // Drum edit for a modified note
    .nrpn((NonRegisteredParameterTypesMSB.drumLevel << 7) | 38, 100)
    // Drum edit for a cleared note
    .nrpn((NonRegisteredParameterTypesMSB.drumPan << 7) | 40, 60)
    // Drum edit for an unmodified note
    .nrpn((NonRegisteredParameterTypesMSB.drumChorus << 7) | 42, 30)
    .note(64, 127);

midi.flush();

// The event order should match the code, esp. data entries being after registered parameters
const drumParams = new Map<
    number,
    "clear" | { level: number; pitchCoarse: number }
>([
    [38, { level: 90, pitchCoarse: 2 }],
    [40, "clear"]
]);
runMIDIEditorTest(midi, {
    fallbackReset: "gs",
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
                drumParams,
                patch: {
                    bankMSB: 0,
                    bankLSB: 3,
                    program: 16,
                    isGMGSDrum: true
                }
            }
        ]
    ]),
    gsChorusParams: {
        level: 120,
        feedback: 45,
        preLowpass: 2,
        rate: 34,
        delay: 65,
        depth: 127,
        sendLevelToDelay: 0,
        sendLevelToReverb: 40
    },
    gsReverbParams: {
        level: 120,
        character: 1,
        delayFeedback: 45,
        preDelayTime: 76,
        preLowpass: 2,
        time: 64
    },
    gsDelayParams: {
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
    gsInsertionParams: {
        type: 0x30_10,
        params: new Uint8Array([
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
            20, 64, 120, 127
        ])
    }
});

const midi2 = new MIDITestMaker("MIDI Editor Insertion order (XG)", {
    system: "gm"
});

midi2
    .note(50, 127)
    .wait(480)
    .rpn(RegisteredParameterTypes.fineTuning, 16_000)
    // Drum edit for a modified note
    .nrpn((NonRegisteredParameterTypesMSB.drumLevel << 7) | 38, 100)
    // Drum edit for a cleared note
    .nrpn((NonRegisteredParameterTypesMSB.drumPan << 7) | 40, 60)
    // Drum edit for an unmodified note
    .nrpn((NonRegisteredParameterTypesMSB.drumChorus << 7) | 42, 30)
    .note(64, 127);

midi2.flush();

runMIDIEditorTest(midi2, {
    fallbackReset: "xg",
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
                drumParams,
                patch: {
                    bankMSB: 0,
                    bankLSB: 3,
                    program: 16,
                    isGMGSDrum: true
                }
            }
        ]
    ]),
    xgReverbParams: {
        type: 0x01_00,
        returnLevel: 70,
        pan: 80,
        params: new Int16Array([
            11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 99
        ])
    },
    xgChorusParams: {
        type: 0x41_00,
        returnLevel: 71,
        pan: 81,
        sendToReverb: 72,
        params: new Int16Array([
            0, 0, 0, 42, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
        ])
    },
    xgVariationParams: {
        type: 0x05_00,
        returnLevel: 73,
        pan: 82,
        sendToReverb: 74,
        sendToChorus: 75,
        insertionMode: false,
        partNumber: 5,
        params: new Int16Array([
            7150, 0, 0, 0, 0, 0, 0, 0, 0, 0, 77, 0, 0, 0, 0, 0
        ])
    },
    xgInsertionParams: new Map([
        [
            1,
            {
                type: 0x49_00,
                partNumber: 3,
                params: new Int16Array([
                    7150, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0
                ])
            }
        ]
    ])
});
