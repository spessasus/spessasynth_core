import { SpessaSynthProcessor } from "../../../processor";
import type {
    MasterParameterChangeCallback,
    MasterParameterType
} from "../../../types";

/**
 * Sets a master parameter of the synthesizer.
 * @param parameter The type of the master parameter to set.
 * @param value The value to set for the master parameter.
 */
export function setMasterParameterInternal<P extends keyof MasterParameterType>(
    this: SpessaSynthProcessor,
    parameter: P,
    value: MasterParameterType[P]
) {
    this.privateProps.masterParameters[parameter] = value;
    // Additional handling for specific parameters
    switch (parameter) {
        case "masterPan": {
            let pan = value as number;
            // Clamp to 0-1 (0 is left)
            pan = pan / 2 + 0.5;
            this.privateProps.panLeft = 1 - pan;
            this.privateProps.panRight = pan;
            break;
        }

        case "masterGain": {
            break;
        }

        case "voiceCap": {
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
            this.privateProps.masterParameters.transposition = 0;
            for (const item of this.midiChannels) {
                item.transposeChannel(semitones);
            }
            this.privateProps.masterParameters.transposition = semitones;
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
    this: SpessaSynthProcessor,
    type: P
): MasterParameterType[P] {
    return this.privateProps.masterParameters[type];
}

/**
 * Gets all master parameters of the synthesizer.
 * @returns All the master parameters.
 */
export function getAllMasterParametersInternal(
    this: SpessaSynthProcessor
): MasterParameterType {
    return { ...this.privateProps.masterParameters };
}
