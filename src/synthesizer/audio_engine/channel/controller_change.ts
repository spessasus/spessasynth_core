import type { MIDIChannel } from "./midi_channel";
import {
    type MIDIController,
    MIDIControllers,
    NonRegisteredMSB
} from "../../../midi/enums";
import { DEFAULT_PERCUSSION } from "../synth_constants";
import { BankSelectHacks } from "../../../utils/midi_hacks";

/**
 * Handles MIDI controller changes for a channel.
 * @param controller The MIDI controller number (0-127).
 * @param value The value of the controller (0-127).
 * @param sendEvent If an event should be emitted.
 * @remarks
 * This function processes MIDI controller changes, updating the channel's
 * midiControllers table and handling special cases like bank select,
 * data entry, and sustain pedal. It also computes modulators for all voices
 * in the channel based on the controller change.
 * to allow changes.
 */
export function controllerChange(
    this: MIDIChannel,
    controller: MIDIController,
    value: number,
    sendEvent = true
) {
    if (controller > 127 || value < 0)
        throw new Error("Invalid MIDI Controller.");

    // Lsb controller values: append them as the lower nibble of the 14-bit value
    // Excluding bank select as it's handled separately
    if (
        controller >= MIDIControllers.modulationWheelLSB &&
        controller <= MIDIControllers.effectControl2LSB
    ) {
        const actualCCNum = controller - 32;
        if (this.lockedControllers[actualCCNum]) return;

        // Append the lower nibble to the main controller
        this.midiControllers[actualCCNum] =
            (this.midiControllers[actualCCNum] & 0x3f_80) | (value & 0x7f);

        this.computeModulatorsAll(1, actualCCNum);
    }
    if (this.lockedControllers[controller]) return;

    // Apply the cc to the table (top 7 bits only, to not override LSB)
    // For consistency we also technically apply this to the LSB controllers directly,
    // But they are unused (except Parameter Numbers)
    this.midiControllers[controller] =
        (value << 7) | (this.midiControllers[controller] & 0x7f);

    // Interpret special CCs
    {
        switch (controller) {
            // Channel mode messages
            case MIDIControllers.omniModeOff:
            case MIDIControllers.omniModeOn:
            case MIDIControllers.allNotesOff: {
                this.stopAllNotes();
                break;
            }

            case MIDIControllers.allSoundOff: {
                this.stopAllNotes(true);
                break;
            }

            case MIDIControllers.polyModeOn: {
                this.stopAllNotes(true);
                this.setMIDIParameter("polyMode", true);
                break;
            }

            case MIDIControllers.monoModeOn: {
                this.stopAllNotes(true);
                this.setMIDIParameter("polyMode", false);
                break;
            }

            // Special case: bank select
            case MIDIControllers.bankSelect: {
                this.setBankMSB(value);
                // Ensure that for XG, drum channels always are 127
                // Testcase
                // Dave-Rodgers-D-j-Vu-Anonymous-20200419154845-nonstop2k.com.mid
                if (
                    this.channel % 16 === DEFAULT_PERCUSSION &&
                    BankSelectHacks.isSystemXG(this.channelSystem)
                ) {
                    this.setBankMSB(127);
                }

                break;
            }

            case MIDIControllers.bankSelectLSB: {
                this.setBankLSB(value);
                break;
            }

            case MIDIControllers.variationDepth: {
                this.synthCore.delayActive = true;
                break;
            }

            case MIDIControllers.registeredParameterLSB:
            case MIDIControllers.registeredParameterMSB: {
                this.lastParameterIsRegistered = true;
                break;
            }

            case MIDIControllers.nonRegisteredParameterMSB: {
                // Sf spec section 9.6.2
                this.sf2NRPNGeneratorLSB = 0;
                this.lastParameterIsRegistered = false;
                break;
            }

            case MIDIControllers.nonRegisteredParameterLSB: {
                if (
                    this.midiControllers[
                        MIDIControllers.nonRegisteredParameterMSB
                    ] >>
                        7 ===
                    NonRegisteredMSB.SF2
                ) {
                    // If a <100 value has already been sent, reset!
                    if (this.sf2NRPNGeneratorLSB % 100 !== 0)
                        this.sf2NRPNGeneratorLSB = 0;

                    switch (value) {
                        case 100: {
                            this.sf2NRPNGeneratorLSB += 100;

                            break;
                        }
                        case 101: {
                            this.sf2NRPNGeneratorLSB += 1000;

                            break;
                        }
                        case 102: {
                            this.sf2NRPNGeneratorLSB += 10_000;

                            break;
                        }
                        default: {
                            if (value < 100) this.sf2NRPNGeneratorLSB += value;
                        }
                    }
                }
                this.lastParameterIsRegistered = false;
                break;
            }

            case MIDIControllers.dataEntryMSB:
            case MIDIControllers.dataEntryLSB: {
                this.dataEntry();
                break;
            }

            case MIDIControllers.resetAllControllers: {
                this.resetRP15();
                break;
            }

            case MIDIControllers.sustainPedal: {
                if (value < 64) {
                    let vc = 0;
                    if (this.voiceCount > 0)
                        for (const v of this.synthCore.voices) {
                            if (
                                v.channel === this.channel &&
                                v.isActive &&
                                v.isHeld
                            ) {
                                v.isHeld = false;
                                v.releaseVoice(this.synthCore.currentTime);
                                if (++vc >= this.voiceCount) break; // We already checked all the voices
                            }
                        }
                }
                break;
            }

            case MIDIControllers.portamentoControl: {
                // Force portamento (MIDI 1.0 specification, page 16)
                // Even if portamento on/off (cc#65) is off
                this.lastNote = value;
                this.portamentoForce = true;
                break;
            }

            // Default: just compute modulators
            default: {
                this.computeModulatorsAll(1, controller);
                break;
            }
        }
    }
    if (!sendEvent) return;

    this.synthCore.callEvent("controllerChange", {
        channel: this.channel,
        controller: controller,
        value: value
    });
}

/**
 * Locks or unlocks a given controller.
 * This prevents any changes to it until it's unlocked.
 * @param controller The MIDI controller number (0-127).
 * @param isLocked If the controller should be locked.
 */
export function lockController(
    this: MIDIChannel,
    controller: MIDIController,
    isLocked: boolean
) {
    // @ts-expect-error We only set it here.
    this.lockedControllers[controller] = isLocked;
}
