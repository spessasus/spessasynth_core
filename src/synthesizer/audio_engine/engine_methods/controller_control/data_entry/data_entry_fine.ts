import { consoleColors } from "../../../../../utils/other";
import { SpessaSynthInfo } from "../../../../../utils/loggin";
import { NON_CC_INDEX_OFFSET } from "../../../engine_components/controller_tables";
import {
    nonRegisteredMSB,
    registeredParameterTypes
} from "./data_entry_coarse";
import { handleAWE32NRPN } from "./awe32";
import type { MIDIChannel } from "../../../engine_components/midi_channel";
import { midiControllers } from "../../../../../midi/enums";
import { customControllers, dataEntryStates } from "../../../../enums";
import { modulatorSources } from "../../../../../soundbank/enums";

/**
 * Executes a data entry fine (LSB) change for the current channel.
 * @param dataValue The value to set for the data entry fine controller (0-127).
 */
export function dataEntryFine(this: MIDIChannel, dataValue: number) {
    // Store in cc table
    this.midiControllers[midiControllers.dataEntryLSB] = dataValue << 7;
    switch (this.dataEntryState) {
        default: {
            break;
        }

        case dataEntryStates.RPCoarse:
        case dataEntryStates.RPFine: {
            const rpnValue =
                this.midiControllers[midiControllers.registeredParameterMSB] |
                (this.midiControllers[midiControllers.registeredParameterLSB] >>
                    7);
            switch (rpnValue) {
                default: {
                    SpessaSynthInfo(
                        `%cUnrecognized RPN LSB for %c${this.channel}%c: %c(0x${rpnValue.toString(16)})%c data value: %c${dataValue}`,
                        consoleColors.warn,
                        consoleColors.recognized,
                        consoleColors.warn,
                        consoleColors.unrecognized,
                        consoleColors.warn,
                        consoleColors.value
                    );
                    break;
                }

                // Pitch wheel range fine tune
                case registeredParameterTypes.pitchWheelRange: {
                    if (dataValue === 0) {
                        break;
                    }
                    // 14-bit value, so upper 7 are coarse and lower 7 are fine!
                    this.midiControllers[
                        NON_CC_INDEX_OFFSET + modulatorSources.pitchWheelRange
                    ] |= dataValue;
                    const actualTune =
                        (this.midiControllers[
                            NON_CC_INDEX_OFFSET +
                                modulatorSources.pitchWheelRange
                        ] >>
                            7) +
                        dataValue / 128;
                    SpessaSynthInfo(
                        `%cChannel ${this.channel} pitch wheel range. Semitones: %c${actualTune}`,
                        consoleColors.info,
                        consoleColors.value
                    );
                    break;
                }

                // Fine-tuning
                case registeredParameterTypes.fineTuning: {
                    // Grab the data and shift
                    const coarse =
                        this.customControllers[customControllers.channelTuning];
                    const finalTuning = (coarse << 7) | dataValue;
                    this.setTuning(finalTuning * 0.012_207_031_25); // Multiply by 8192 / 100 (cent increments)
                    break;
                }

                // Modulation depth
                case registeredParameterTypes.modulationDepth: {
                    const currentModulationDepthCents =
                        this.customControllers[
                            customControllers.modulationMultiplier
                        ] * 50;
                    const cents =
                        currentModulationDepthCents + (dataValue / 128) * 100;
                    this.setModulationDepth(cents);
                    break;
                }

                case 0x3f_ff: {
                    this.resetParameters();
                    break;
                }
            }
            break;
        }

        case dataEntryStates.NRPFine: {
            const paramCoarse =
                this.midiControllers[
                    midiControllers.nonRegisteredParameterMSB
                ] >> 7;
            const paramFine =
                this.midiControllers[
                    midiControllers.nonRegisteredParameterLSB
                ] >> 7;

            // SF2 and GS NRPN don't use lsb (but sometimes these are still sent!)
            if (
                paramCoarse === nonRegisteredMSB.SF2 ||
                (paramCoarse >= nonRegisteredMSB.drumPitch &&
                    paramCoarse <= nonRegisteredMSB.drumDelay) ||
                paramCoarse === nonRegisteredMSB.partParameter
            ) {
                return;
            }
            switch (paramCoarse) {
                default: {
                    SpessaSynthInfo(
                        `%cUnrecognized NRPN LSB for %c${this.channel}%c: %c(0x${paramCoarse
                            .toString(16)
                            .toUpperCase()} 0x${paramFine
                            .toString(16)
                            .toUpperCase()})%c data value: %c${dataValue}`,
                        consoleColors.warn,
                        consoleColors.recognized,
                        consoleColors.warn,
                        consoleColors.unrecognized,
                        consoleColors.warn,
                        consoleColors.value
                    );
                    break;
                }

                case nonRegisteredMSB.awe32: {
                    handleAWE32NRPN.call(
                        this,
                        paramFine,
                        dataValue,
                        this.midiControllers[midiControllers.dataEntryMSB] >> 7
                    );
                    break;
                }
            }
        }
    }
}
