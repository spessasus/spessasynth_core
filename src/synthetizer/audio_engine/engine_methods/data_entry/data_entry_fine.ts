import { consoleColors } from "../../../../utils/other.js";
import { SpessaSynthInfo, SpessaSynthWarn } from "../../../../utils/loggin.js";
import { modulatorSources } from "../../../../soundbank/basic_soundbank/modulator.js";
import {
    customControllers,
    dataEntryStates,
    NON_CC_INDEX_OFFSET
} from "../../engine_components/controller_tables.js";
import {
    nonRegisteredMSB,
    registeredParameterTypes
} from "./data_entry_coarse.js";
import { handleAWE32NRPN } from "./awe32.js";
import { midiControllers } from "../../../../midi/enums.ts";

/**
 * Executes a data entry for an RPN tuning
 * @param dataValue {number} dataEntry LSB
 * @this {MidiAudioChannel}
 * @private
 */
export function dataEntryFine(dataValue) {
    // store in cc table
    this.midiControllers[midiControllers.lsbForControl6DataEntry] =
        dataValue << 7;
    switch (this.dataEntryState) {
        default:
            break;

        case dataEntryStates.RPCoarse:
        case dataEntryStates.RPFine:
            const rpnValue =
                this.midiControllers[midiControllers.RPNMsb] |
                (this.midiControllers[midiControllers.RPNLsb] >> 7);
            switch (rpnValue) {
                default:
                    break;

                // pitch bend range fine tune
                case registeredParameterTypes.pitchBendRange:
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
                        `%cChannel ${this.channelNumber} bend range. Semitones: %c${actualTune}`,
                        consoleColors.info,
                        consoleColors.value
                    );
                    break;

                // fine-tuning
                case registeredParameterTypes.fineTuning:
                    // grab the data and shift
                    const coarse =
                        this.customControllers[customControllers.channelTuning];
                    const finalTuning = (coarse << 7) | dataValue;
                    this.setTuning(finalTuning * 0.01220703125); // multiply by 8192 / 100 (cent increments)
                    break;

                // modulation depth
                case registeredParameterTypes.modulationDepth:
                    const currentModulationDepthCents =
                        this.customControllers[
                            customControllers.modulationMultiplier
                        ] * 50;
                    const cents =
                        currentModulationDepthCents + (dataValue / 128) * 100;
                    this.setModulationDepth(cents);
                    break;

                case 0x3fff:
                    this.resetParameters();
                    break;
            }
            break;

        case dataEntryStates.NRPFine:
            /**
             * @type {number}
             */
            const NRPNCoarse =
                this.midiControllers[midiControllers.NRPNMsb] >> 7;
            /**
             * @type {number}
             */
            const NRPNFine = this.midiControllers[midiControllers.NRPNLsb] >> 7;
            if (NRPNCoarse === nonRegisteredMSB.SF2) {
                return;
            }
            switch (NRPNCoarse) {
                default:
                    SpessaSynthWarn(
                        `%cUnrecognized NRPN LSB for %c${this.channelNumber}%c: %c(0x${NRPNFine.toString(
                            16
                        ).toUpperCase()} 0x${NRPNFine.toString(
                            16
                        ).toUpperCase()})%c data value: %c${dataValue}`,
                        consoleColors.warn,
                        consoleColors.recognized,
                        consoleColors.warn,
                        consoleColors.unrecognized,
                        consoleColors.warn,
                        consoleColors.value
                    );
                    break;

                case nonRegisteredMSB.awe32:
                    handleAWE32NRPN.call(
                        this,
                        NRPNFine,
                        dataValue,
                        this.midiControllers[midiControllers.dataEntryMsb] >> 7
                    );
                    break;
            }
    }
}
