import type {
    MasterParameterChangeCallback,
    MasterParameterType
} from "../../../types";
import type { SynthesizerCore } from "../../synthesizer_core";
import { SpessaSynthWarn } from "../../../../utils/loggin";
import { Voice } from "../../engine_components/voice";

/**
 * Sets a master parameter of the synthesizer.
 * @param parameter The type of the master parameter to set.
 * @param value The value to set for the master parameter.
 */
export function setMasterParameterInternal<P extends keyof MasterParameterType>(
    this: SynthesizerCore,
    parameter: P,
    value: MasterParameterType[P]
) {
    this.masterParameters[parameter] = value;
    // Additional handling for specific parameters
    switch (parameter) {
        case "masterPan": {
            let pan = value as number;
            // Clamp to 0-1 (0 is left)
            pan = pan / 2 + 0.5;
            this.panLeft = 1 - pan;
            this.panRight = pan;
            break;
        }

        case "masterGain": {
            break;
        }

        case "voiceCap": {
            // Infinity is not allowed
            const cap = Math.min(value as number, 1_000_000);
            this.masterParameters.voiceCap = cap;
            if (cap > this.voices.length) {
                SpessaSynthWarn(
                    `Allocating ${cap - this.voices.length} new voices!`
                );
                for (let i = this.voices.length; i < cap; i++) {
                    this.voices.push(new Voice(this.sampleRate));
                }
            }
            break;
        }

        case "interpolationType": {
            break;
        }

        case "midiSystem": {
            break;
        }

        case "monophonicRetriggerMode": {
            break;
        }

        case "transposition": {
            const semitones = value as number;
            // Reset transposition temporarily
            this.masterParameters.transposition = 0;
            for (const item of this.midiChannels) {
                item.transposeChannel(semitones);
            }
            this.masterParameters.transposition = semitones;
        }
    }
    this.callEvent("masterParameterChange", {
        parameter,
        value
    } as MasterParameterChangeCallback);
}

/**
 * Gets a master parameter of the synthesizer.
 * @param type The type of the master parameter to get.
 * @returns The value of the master parameter.
 */
export function getMasterParameterInternal<P extends keyof MasterParameterType>(
    this: SynthesizerCore,
    type: P
): MasterParameterType[P] {
    return this.masterParameters[type];
}

/**
 * Gets all master parameters of the synthesizer.
 * @returns All the master parameters.
 */
export function getAllMasterParametersInternal(
    this: SynthesizerCore
): MasterParameterType {
    return { ...this.masterParameters };
}
