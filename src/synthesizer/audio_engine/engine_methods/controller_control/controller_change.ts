import { nonRegisteredMSB } from "./data_entry/data_entry_coarse";
import type { MIDIChannel } from "../../engine_components/midi_channel";
import { type MIDIController, midiControllers } from "../../../../midi/enums";
import { customControllers, dataEntryStates } from "../../../enums";
import { DEFAULT_PERCUSSION } from "../../engine_components/synth_constants";
import { BankSelectHacks } from "../../../../utils/midi_hacks";

/**
 * Handles MIDI controller changes for a channel.
 * @param controllerNumber The MIDI controller number (0-127).
 * @param controllerValue The value of the controller (0-127).
 * @param sendEvent If an event should be emitted.
 * @remarks
 * This function processes MIDI controller changes, updating the channel's
 * midiControllers table and handling special cases like bank select,
 * data entry, and sustain pedal. It also computes modulators for all voices
 * in the channel based on the controller change.
 * If the controller number is greater than 127, it is treated as a channel
 * configuration controller, and the `force` parameter must be set to true
 * to allow changes.
 */
export function controllerChange(
    this: MIDIChannel,
    controllerNumber: MIDIController,
    controllerValue: number,
    sendEvent = true
) {
    if (controllerNumber > 127) {
        throw new Error("Invalid MIDI Controller.");
    }

    // Lsb controller values: append them as the lower nibble of the 14-bit value
    // Excluding bank select and data entry as it's handled separately
    if (
        controllerNumber >= midiControllers.modulationWheelLSB &&
        controllerNumber <= midiControllers.effectControl2LSB &&
        controllerNumber !== midiControllers.dataEntryLSB
    ) {
        const actualCCNum = controllerNumber - 32;
        if (this.lockedControllers[actualCCNum]) {
            return;
        }
        // Append the lower nibble to the main controller
        this.midiControllers[actualCCNum] =
            (this.midiControllers[actualCCNum] & 0x3f_80) |
            (controllerValue & 0x7f);
        for (const v of this.voices) this.computeModulators(v, 1, actualCCNum);
    }
    if (this.lockedControllers[controllerNumber]) {
        return;
    }

    // Apply the cc to the table
    this.midiControllers[controllerNumber] = controllerValue << 7;

    // Interpret special CCs
    {
        switch (controllerNumber) {
            case midiControllers.allNotesOff: {
                this.stopAllNotes();
                break;
            }

            case midiControllers.allSoundOff: {
                this.stopAllNotes(true);
                break;
            }

            // Special case: bank select
            case midiControllers.bankSelect: {
                this.setBankMSB(controllerValue);
                // Ensure that for XG, drum channels always are 127
                // Testcase
                // Dave-Rodgers-D-j-Vu-Anonymous-20200419154845-nonstop2k.com.mid
                if (
                    this.channelNumber % 16 === DEFAULT_PERCUSSION &&
                    BankSelectHacks.isSystemXG(this.channelSystem)
                ) {
                    this.setBankMSB(127);
                }

                break;
            }

            case midiControllers.bankSelectLSB: {
                this.setBankLSB(controllerValue);
                break;
            }

            // Check for RPN and NPRN and data entry
            case midiControllers.registeredParameterLSB: {
                this.dataEntryState = dataEntryStates.RPFine;
                break;
            }

            case midiControllers.registeredParameterMSB: {
                this.dataEntryState = dataEntryStates.RPCoarse;
                break;
            }

            case midiControllers.nonRegisteredParameterMSB: {
                // Sf spec section 9.6.2
                this.customControllers[customControllers.sf2NPRNGeneratorLSB] =
                    0;
                this.dataEntryState = dataEntryStates.NRPCoarse;
                break;
            }

            case midiControllers.nonRegisteredParameterLSB: {
                if (
                    this.midiControllers[
                        midiControllers.nonRegisteredParameterMSB
                    ] >>
                        7 ===
                    nonRegisteredMSB.SF2
                ) {
                    // If a <100 value has already been sent, reset!
                    if (
                        this.customControllers[
                            customControllers.sf2NPRNGeneratorLSB
                        ] %
                            100 !==
                        0
                    ) {
                        this.customControllers[
                            customControllers.sf2NPRNGeneratorLSB
                        ] = 0;
                    }

                    switch (controllerValue) {
                        case 100: {
                            this.customControllers[
                                customControllers.sf2NPRNGeneratorLSB
                            ] += 100;

                            break;
                        }
                        case 101: {
                            this.customControllers[
                                customControllers.sf2NPRNGeneratorLSB
                            ] += 1000;

                            break;
                        }
                        case 102: {
                            this.customControllers[
                                customControllers.sf2NPRNGeneratorLSB
                            ] += 10_000;

                            break;
                        }
                        default: {
                            if (controllerValue < 100) {
                                this.customControllers[
                                    customControllers.sf2NPRNGeneratorLSB
                                ] += controllerValue;
                            }
                        }
                    }
                }
                this.dataEntryState = dataEntryStates.NRPFine;
                break;
            }

            case midiControllers.dataEntryMSB: {
                this.dataEntryCoarse(controllerValue);
                break;
            }

            case midiControllers.dataEntryLSB: {
                this.dataEntryFine(controllerValue);
                break;
            }

            case midiControllers.resetAllControllers: {
                this.resetControllersRP15Compliant();
                break;
            }

            case midiControllers.sustainPedal: {
                if (controllerValue < 64) {
                    for (const v of this.sustainedVoices) {
                        v.scheduleRelease(this.synth.currentSynthTime);
                    }
                    this.sustainedVoices = [];
                }
                break;
            }

            // Default: just compute modulators
            default: {
                for (const v of this.voices)
                    this.computeModulators(v, 1, controllerNumber);
                break;
            }
        }
    }
    if (!sendEvent) {
        return;
    }
    this.synthProps.callEvent("controllerChange", {
        channel: this.channelNumber,
        controllerNumber: controllerNumber,
        controllerValue: controllerValue
    });
}
