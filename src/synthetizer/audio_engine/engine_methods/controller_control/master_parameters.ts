import { SpessaSynthProcessor } from "../../main_processor";
import type { SynthSystem } from "../../../types";
import type { interpolationTypes } from "../../../enums";

// The master parameters of the synthesizer.
export type MasterParameterType = {
    // The master gain, from 0 to any number. 1 is 100% volume.
    masterGain: number;
    // The master pan, from -1 (left) to 1 (right). 0 is center.
    masterPan: number;
    // The maximum number of voices that can be played at once.
    voiceCap: number;
    // The interpolation type used for sample playback.
    interpolationType: interpolationTypes;
    // The MIDI system used by the synthesizer. (GM, GM2, GS, XG)
    midiSystem: SynthSystem;
    // Indicates whether the synthesizer is in monophonic retrigger mode.
    // This emulates the behavior of Microsoft GS Wavetable Synth,
    // where a new note will kill the previous one if it is still playing.
    monophonicRetriggerMode: boolean;
    // The reverb gain, from 0 to any number. 1 is 100% reverb.
    reverbGain: number;
    // The chorus gain, from 0 to any number. 1 is 100% chorus.
    chorusGain: number;
    // Forces note killing instead of releasing. Improves performance in black MIDIs.
    blackMIDIMode: boolean;
    // The global transposition in semitones. It can be decimal.
    transposition: number;
};

/**
 * Sets a master parameter of the synthesizer.
 * @param type The type of the master parameter to set.
 * @param value The value to set for the master parameter.
 */
export function setMasterParameter<P extends keyof MasterParameterType>(
    this: SpessaSynthProcessor,
    type: P,
    value: MasterParameterType[P]
) {
    this.privateProps.masterParameters[type] = value;
    // additional handling for specific parameters
    switch (type) {
        case "masterPan": {
            let pan = value as number;
            // clamp to 0-1 (0 is left)
            pan = pan / 2 + 0.5;
            this.privateProps.panLeft = 1 - pan;
            this.privateProps.panRight = pan;
            break;
        }

        case "masterGain":
            break;

        case "voiceCap":
            break;

        case "interpolationType":
            break;

        case "midiSystem":
            break;

        case "monophonicRetriggerMode":
            break;

        case "transposition": {
            const semitones = value as number;
            // reset transposition temporarily
            this.privateProps.masterParameters.transposition = 0;
            for (let i = 0; i < this.midiChannels.length; i++) {
                this.midiChannels[i].transposeChannel(semitones);
            }
            this.privateProps.masterParameters.transposition = semitones;
        }
    }
    this?.onMasterParameterChange?.(type, value);
}

/**
 * Gets a master parameter of the synthesizer.
 * @param type The type of the master parameter to get.
 * @returns The value of the master parameter.
 */
export function getMasterParameter<P extends keyof MasterParameterType>(
    this: SpessaSynthProcessor,
    type: P
): MasterParameterType[P] {
    return this.privateProps.masterParameters[type];
}
