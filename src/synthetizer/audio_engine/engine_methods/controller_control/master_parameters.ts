import { SpessaSynthProcessor } from "../../main_processor";
import type { MasterParameterType } from "../../../types";

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
