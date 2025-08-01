import { channelConfiguration } from "../../engine_components/controller_tables";
import { nonRegisteredMSB } from "./data_entry/data_entry_coarse";
import type { MIDIChannel } from "../../engine_components/midi_channel";
import { midiControllers } from "../../../../midi/enums";
import { customControllers, dataEntryStates } from "../../../enums";

/**
 * Handles MIDI controller changes for a channel.
 * @param controllerNumber The MIDI controller number (0-127).
 * @param controllerValue The value of the controller (0-127).
 * @param force If true, allows changes to channel configuration controllers (128+).
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
    controllerNumber: number,
    controllerValue: number,
    force = false
) {
    if (controllerNumber > 127) {
        // channel configuration. force must be set to true
        if (!force) {
            return;
        }
        switch (controllerNumber) {
            default:
                return;

            case channelConfiguration.velocityOverride:
                this.velocityOverride = controllerValue;
        }
    }

    // lsb controller values: append them as the lower nibble of the 14-bit value
    // excluding bank select and data entry as it's handled separately
    if (
        controllerNumber >= midiControllers.lsbForControl1ModulationWheel &&
        controllerNumber <= midiControllers.lsbForControl13EffectControl2 &&
        controllerNumber !== midiControllers.lsbForControl6DataEntry
    ) {
        const actualCCNum = controllerNumber - 32;
        if (this.lockedControllers[actualCCNum]) {
            return;
        }
        // append the lower nibble to the main controller
        this.midiControllers[actualCCNum] =
            (this.midiControllers[actualCCNum] & 0x3f80) |
            (controllerValue & 0x7f);
        this.voices.forEach((v) => this.computeModulators(v, 1, actualCCNum));
    }
    if (this.lockedControllers[controllerNumber]) {
        return;
    }

    // apply the cc to the table
    this.midiControllers[controllerNumber] = controllerValue << 7;

    // interpret special CCs
    {
        switch (controllerNumber) {
            case midiControllers.allNotesOff:
                this.stopAllNotes();
                break;

            case midiControllers.allSoundOff:
                this.stopAllNotes(true);
                break;

            // special case: bank select
            case midiControllers.bankSelect:
                this.setBankSelect(controllerValue);
                break;

            case midiControllers.lsbForControl0BankSelect:
                this.setBankSelect(controllerValue, true);
                break;

            // check for RPN and NPRN and data entry
            case midiControllers.RPNLsb:
                this.dataEntryState = dataEntryStates.RPFine;
                break;

            case midiControllers.RPNMsb:
                this.dataEntryState = dataEntryStates.RPCoarse;
                break;

            case midiControllers.NRPNMsb:
                // sf spec section 9.6.2
                this.customControllers[customControllers.sf2NPRNGeneratorLSB] =
                    0;
                this.dataEntryState = dataEntryStates.NRPCoarse;
                break;

            case midiControllers.NRPNLsb:
                if (
                    this.midiControllers[midiControllers.NRPNMsb] >> 7 ===
                    nonRegisteredMSB.SF2
                ) {
                    // if a <100 value has already been sent, reset!
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

                    if (controllerValue === 100) {
                        this.customControllers[
                            customControllers.sf2NPRNGeneratorLSB
                        ] += 100;
                    } else if (controllerValue === 101) {
                        this.customControllers[
                            customControllers.sf2NPRNGeneratorLSB
                        ] += 1000;
                    } else if (controllerValue === 102) {
                        this.customControllers[
                            customControllers.sf2NPRNGeneratorLSB
                        ] += 10000;
                    } else if (controllerValue < 100) {
                        this.customControllers[
                            customControllers.sf2NPRNGeneratorLSB
                        ] += controllerValue;
                    }
                }
                this.dataEntryState = dataEntryStates.NRPFine;
                break;

            case midiControllers.dataEntryMsb:
                this.dataEntryCoarse(controllerValue);
                break;

            case midiControllers.lsbForControl6DataEntry:
                this.dataEntryFine(controllerValue);
                break;

            case midiControllers.resetAllControllers:
                this.resetControllersRP15Compliant();
                break;

            case midiControllers.sustainPedal:
                if (controllerValue >= 64) {
                    this.holdPedal = true;
                } else {
                    this.holdPedal = false;
                    this.sustainedVoices.forEach((v) => {
                        v.release(this.synth.currentSynthTime);
                    });
                    this.sustainedVoices = [];
                }
                break;

            // default: just compute modulators
            default:
                this.voices.forEach((v) =>
                    this.computeModulators(v, 1, controllerNumber)
                );
                break;
        }
    }
    this.synthProps.callEvent("controllerChange", {
        channel: this.channelNumber,
        controllerNumber: controllerNumber,
        controllerValue: controllerValue
    });
}
