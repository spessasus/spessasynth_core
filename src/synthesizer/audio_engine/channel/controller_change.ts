import type { MIDIChannel } from "./midi_channel";
import {
    type MIDIController,
    MIDIControllers,
    NonRegisteredParameterTypesMSB
} from "../../../midi/enums";
import { MIDI_DRUM_CHANNEL } from "../synth_constants";
import { GeneratorTypes } from "../../../soundbank/basic_soundbank/generator_types";

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
 */
export function controllerChange(
    this: MIDIChannel,
    controller: MIDIController,
    value: number,
    sendEvent = true
) {
    if (controller > 127 || value < 0)
        throw new Error("Invalid MIDI Controller.");

    // The data entry LSB is the lower 7 bits of the data entry (CC 6).
    // The other LSB controllers (CC 33 to 63) are independent 7-bit controllers (SFe 4.0, section 11.3),
    // Bank select (CC 0 and 32) is handled separately
    if (controller === MIDIControllers.dataEntryLSB) {
        // A lock on either controller of the pair keeps the 14-bit value
        if (
            this.lockedControllers[MIDIControllers.dataEntryMSB] ||
            this.lockedControllers[controller]
        )
            return;
        this._midiControllers[MIDIControllers.dataEntryMSB] =
            (this._midiControllers[MIDIControllers.dataEntryMSB] & 0x3f_80) |
            (value & 0x7f);
    }
    if (this.lockedControllers[controller]) return;

    // Apply the cc to the table as the top 7 bits. Only the data entry has lower bits, which it keeps
    this._midiControllers[controller] =
        (value << 7) | (this._midiControllers[controller] & 0x7f);

    // Interpret special CCs
    {
        switch (controller) {
            // Channel mode messages
            // Mono and Poly On act as All Notes Off too, as MIDI 1.0 asks (SFe 4.0, section 11.5)
            case MIDIControllers.omniModeOff:
            case MIDIControllers.omniModeOn:
            case MIDIControllers.monoModeOn:
            case MIDIControllers.polyModeOn:
            case MIDIControllers.allNotesOff: {
                if (
                    this._midiControllers[MIDIControllers.sustainPedal] >=
                        8192 &&
                    (this._midiParameters.polyMode || this._drumChannel)
                ) {
                    // A note off for every voice: the pedal holds them, like GS and XG devices do.
                    // Voices that ignore note off are not held, so they get released
                    this.noteOnID.fill(0);
                    this.noteOffID.fill(0);
                    this.playingNotes.fill(false);
                    let vc = 0;
                    if (this._voiceCount > 0)
                        for (const v of this.synthCore.voices) {
                            if (v.channel === this.channel && v.isActive) {
                                if (
                                    v.modulatedGenerators[
                                        GeneratorTypes.ignoreNoteOff
                                    ]
                                )
                                    v.releaseVoice(this.synthCore.currentTime);
                                else if (!v.isInRelease) v.isHeld = true;
                                if (++vc >= this._voiceCount) break; // We already checked all the voices
                            }
                        }
                } else this.stopAllNotes();
                // The mode changes after the notes off, so they follow the previous mode
                if (controller === MIDIControllers.polyModeOn) {
                    this.setMIDIParameter("polyMode", true);
                } else if (controller === MIDIControllers.monoModeOn) {
                    this.setMIDIParameter("polyMode", false);
                }
                break;
            }

            case MIDIControllers.allSoundOff: {
                this.stopAllNotes(true);
                break;
            }

            // Special case: bank select
            case MIDIControllers.bankSelect: {
                // GM ignores bank selects
                if (this.channelSystem === "gm") break;
                // This emulates the XG "DRUM PART PROTECT MODE", which is not implemented yet,
                // So it is always on: part 10 only receives the drum banks 120, 126 and 127 and can never be melodic!
                // 120 is the GM2 drum bank, SFe 4.0, section 11.2.2 accepts it too
                // GM2 has no such rule, its channel 10 turns melodic with bank 121.
                // Testcase
                // Dave-Rodgers-D-j-Vu-Anonymous-20200419154845-nonstop2k.com.mid
                if (
                    this.channel % 16 === MIDI_DRUM_CHANNEL &&
                    this.channelSystem === "xg" &&
                    value !== 120 &&
                    value !== 126 &&
                    value !== 127
                ) {
                    break;
                }
                this.setBankMSB(value);
                break;
            }

            case MIDIControllers.bankSelectLSB: {
                // GM ignores bank selects
                if (this.channelSystem === "gm") break;
                this.setBankLSB(value);
                break;
            }

            case MIDIControllers.pan: {
                // Pan disables random pan
                if (this._midiParameters.randomPan)
                    this.setMIDIParameter("randomPan", false);
                this.computeModulatorsAll(1, controller);
                break;
            }

            case MIDIControllers.variationDepth: {
                this.synthCore.updateActiveGSEffects();
                // The send itself is a modulator (variationEffectsSend)
                this.computeModulatorsAll(1, controller);
                break;
            }

            case MIDIControllers.registeredParameterLSB:
            case MIDIControllers.registeredParameterMSB: {
                // Clear and set state.
                // This is technically not a MIDI behavior,
                // But some MIDI files only send MSB data:
                // https://github.com/spessasus/spessasynth_core/pull/78#discussion_r3233413622
                this._midiControllers[MIDIControllers.dataEntryMSB] = 0;
                this.lastParameterIsRegistered = true;
                break;
            }

            case MIDIControllers.nonRegisteredParameterMSB: {
                // Sf spec section 9.6.2
                this.sf2NRPNGeneratorLSB = 0;

                // Clear and set state.
                // This is technically not a MIDI behavior,
                // But some MIDI files only send MSB data:
                // https://github.com/spessasus/spessasynth_core/pull/78#discussion_r3233413622
                this._midiControllers[MIDIControllers.dataEntryMSB] = 0;
                this.lastParameterIsRegistered = false;
                break;
            }

            case MIDIControllers.nonRegisteredParameterLSB: {
                if (
                    this._midiControllers[
                        MIDIControllers.nonRegisteredParameterMSB
                    ] >>
                        7 ===
                    NonRegisteredParameterTypesMSB.SF2
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

                // Clear and set state.
                // This is technically not a MIDI behavior,
                // But some MIDI files only send MSB data:
                // https://github.com/spessasus/spessasynth_core/pull/78#discussion_r3233413622
                this._midiControllers[MIDIControllers.dataEntryMSB] = 0;
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
                    if (this._voiceCount > 0)
                        for (const v of this.synthCore.voices) {
                            if (
                                v.channel === this.channel &&
                                v.isActive &&
                                v.isHeld
                            ) {
                                v.isHeld = false;
                                v.releaseVoice(this.synthCore.currentTime);
                                if (++vc >= this._voiceCount) break; // We already checked all the voices
                            }
                        }
                }
                // The pedal is still a modulator source (SFe 4.0, section 7.4)
                this.computeModulatorsAll(1, controller);
                break;
            }

            case MIDIControllers.portamentoControl: {
                // Force portamento (MIDI 1.0 specification, page 16)
                // Even if portamento on/off (cc#65) is off
                this.lastPortamentoNote = value;
                this.portamentoForce = true;
                this.computeModulatorsAll(1, controller);
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
