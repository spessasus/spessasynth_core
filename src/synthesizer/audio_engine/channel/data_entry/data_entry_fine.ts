import { ConsoleColors } from "../../../../utils/other";
import { SpessaSynthLog } from "../../../../utils/loggin";
import {
    NonRegisteredMSB,
    RegisteredParameterTypes
} from "./data_entry_coarse";
import { handleAWE32NRPN } from "./awe32";
import type { MIDIChannel } from "../midi_channel";
import { MIDIControllers } from "../../../../midi/enums";

/**
 * Executes a data entry fine (LSB) change for the current channel.
 * @param dataValue The value to set for the data entry fine controller (0-127).
 */
export function dataEntryFine(this: MIDIChannel, dataValue: number) {
    // Store in cc table
    this.midiControllers[MIDIControllers.dataEntryLSB] = dataValue << 7;
    // RPN Handling
    if (this.lastParameterIsRegistered) {
        const rpnValue =
            this.midiControllers[MIDIControllers.registeredParameterMSB] |
            (this.midiControllers[MIDIControllers.registeredParameterLSB] >> 7);
        switch (rpnValue) {
            default: {
                SpessaSynthLog.info(
                    `%cUnrecognized RPN for %c${this.channel}%c: %c(0x${rpnValue.toString(16)})%c data value: %c${dataValue}`,
                    ConsoleColors.warn,
                    ConsoleColors.recognized,
                    ConsoleColors.warn,
                    ConsoleColors.unrecognized,
                    ConsoleColors.warn,
                    ConsoleColors.value
                );
                break;
            }

            // Pitch wheel range fine tune
            case RegisteredParameterTypes.pitchWheelRange: {
                if (dataValue === 0) {
                    break;
                }
                // 14-bit value, so upper 7 are coarse and lower 7 are fine!
                const current = this._midiParameters.pitchWheelRange;
                const updated = ((current << 7) | dataValue) / 128;
                this.pitchWheelRange(updated);
                break;
            }

            // Fine-tuning
            case RegisteredParameterTypes.fineTuning: {
                // Grab the data and shift
                const coarse =
                    this.midiControllers[MIDIControllers.dataEntryMSB] >> 7;
                const finalTuning = ((coarse << 7) | dataValue) - 8192;
                this.fineTune(finalTuning * 0.012_207_031_25); // Multiply by 8192 / 100 (cent increments)
                break;
            }

            // Modulation depth
            case RegisteredParameterTypes.modulationDepth: {
                const currentModulationDepthCents =
                    this._midiParameters.modulationDepth * 50;
                const cents =
                    currentModulationDepthCents + (dataValue / 128) * 100;
                this.modulationDepth(cents);
                break;
            }

            case RegisteredParameterTypes.resetParameters: {
                this.resetParameters();
                break;
            }
        }
        return;
    }

    // RPN Handling
    const paramCoarse =
        this.midiControllers[MIDIControllers.nonRegisteredParameterMSB] >> 7;
    const paramFine =
        this.midiControllers[MIDIControllers.nonRegisteredParameterLSB] >> 7;

    // SF2 and GS NRPN don't use lsb (but sometimes these are still sent!)
    if (
        paramCoarse === NonRegisteredMSB.SF2 ||
        (paramCoarse >= NonRegisteredMSB.drumPitch &&
            paramCoarse <= NonRegisteredMSB.drumDelay) ||
        paramCoarse === NonRegisteredMSB.partParameter
    ) {
        return;
    }
    switch (paramCoarse) {
        default: {
            SpessaSynthLog.info(
                `%cUnrecognized NRPN LSB for %c${this.channel}%c: %c(0x${paramCoarse
                    .toString(16)
                    .toUpperCase()} 0x${paramFine
                    .toString(16)
                    .toUpperCase()})%c data value: %c${dataValue}`,
                ConsoleColors.warn,
                ConsoleColors.recognized,
                ConsoleColors.warn,
                ConsoleColors.unrecognized,
                ConsoleColors.warn,
                ConsoleColors.value
            );
            break;
        }

        case NonRegisteredMSB.awe32: {
            handleAWE32NRPN.call(
                this,
                paramFine,
                dataValue,
                this.midiControllers[MIDIControllers.dataEntryMSB] >> 7
            );
            break;
        }
    }
}
