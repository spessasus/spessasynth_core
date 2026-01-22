import { SpessaSynthInfo } from "../../../../../utils/loggin";
import { consoleColors } from "../../../../../utils/other";
import type { MIDIChannel } from "../../../engine_components/midi_channel";
import type { GeneratorType } from "../../../../../soundbank/basic_soundbank/generator_types";
import { NON_CC_INDEX_OFFSET } from "../../../engine_components/controller_tables";
import { modulatorSources } from "../../../../../soundbank/enums";
import { customControllers, dataEntryStates } from "../../../../enums";
import { midiControllers } from "../../../../../midi/enums";

export const registeredParameterTypes = {
    pitchWheelRange: 0x00_00,
    fineTuning: 0x00_01,
    coarseTuning: 0x00_02,
    modulationDepth: 0x00_05,
    resetParameters: 0x3f_ff
};

export const nonRegisteredMSB = {
    partParameter: 0x01,
    awe32: 0x7f,
    SF2: 120
};

/**
 * https://cdn.roland.com/assets/media/pdf/SC-88PRO_OM.pdf
 * http://hummer.stanford.edu/sig/doc/classes/MidiOutput/rpn.html
 * These also seem to match XG
 * @enum {number}
 */
const nonRegisteredLSB = {
    vibratoRate: 0x08,
    vibratoDepth: 0x09,
    vibratoDelay: 0x0a,

    TVFFilterCutoff: 0x20,
    TVFFilterResonance: 0x21,

    EGAttackTime: 0x63,
    EGDecayTime: 0x64,
    EGReleaseTime: 0x66
};

// A helper function to log info in a nice way
const coolInfo = (
    chanNum: number,
    what: string,
    value: string | number,
    type: string
) => {
    if (type.length > 0) {
        type = " " + type;
    }
    SpessaSynthInfo(
        `%c${what} for %c${chanNum}%c is now set to %c${value}%c${type}.`,
        consoleColors.info,
        consoleColors.recognized,
        consoleColors.info,
        consoleColors.value,
        consoleColors.info
    );
};

const addDefaultVibrato = (chan: MIDIChannel) => {
    if (
        chan.channelVibrato.delay === 0 &&
        chan.channelVibrato.rate === 0 &&
        chan.channelVibrato.depth === 0
    ) {
        chan.channelVibrato.depth = 50;
        chan.channelVibrato.rate = 8;
        chan.channelVibrato.delay = 0.6;
    }
};

/**
 * Executes a data entry coarse (MSB) change for the current channel.
 * @param dataValue The value to set for the data entry coarse controller (0-127).
 */
export function dataEntryCoarse(this: MIDIChannel, dataValue: number) {
    // Store in cc table
    this.midiControllers[midiControllers.dataEntryMSB] = dataValue << 7;
    /*
    A note on this vibrato.
    This is a completely custom vibrato, with its own oscillator and parameters.
    It is disabled by default,
    only being enabled when one of the NPRN messages changing it is received
    and stays on until the next system-reset.
    It was implemented very early in SpessaSynth's development,
    because I wanted support for Touhou MIDIs :-)
     */

    switch (this.dataEntryState) {
        default:
        case dataEntryStates.Idle: {
            break;
        }

        // Process NRPNs
        case dataEntryStates.NRPFine: {
            if (this.lockGSNRPNParams) {
                return;
            }
            const NRPNCoarse =
                this.midiControllers[
                    midiControllers.nonRegisteredParameterMSB
                ] >> 7;
            const NRPNFine =
                this.midiControllers[
                    midiControllers.nonRegisteredParameterLSB
                ] >> 7;
            const dataEntryFine =
                this.midiControllers[midiControllers.dataEntryLSB] >> 7;
            switch (NRPNCoarse) {
                default: {
                    if (dataValue === 64) {
                        // Default value
                        return;
                    }
                    SpessaSynthInfo(
                        `%cUnrecognized NRPN for %c${this.channelNumber}%c: %c(0x${NRPNFine.toString(
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
                }

                // Part parameters
                case nonRegisteredMSB.partParameter: {
                    switch (NRPNFine) {
                        default: {
                            if (dataValue === 64) {
                                // Default value
                                return;
                            }
                            SpessaSynthInfo(
                                `%cUnrecognized NRPN for %c${this.channelNumber}%c: %c(0x${NRPNCoarse.toString(16)} 0x${NRPNFine.toString(
                                    16
                                )})%c data value: %c${dataValue}`,
                                consoleColors.warn,
                                consoleColors.recognized,
                                consoleColors.warn,
                                consoleColors.unrecognized,
                                consoleColors.warn,
                                consoleColors.value
                            );
                            break;
                        }

                        // Vibrato rate (custom vibrato)
                        case nonRegisteredLSB.vibratoRate: {
                            if (dataValue === 64) {
                                return;
                            }
                            addDefaultVibrato(this);
                            this.channelVibrato.rate = (dataValue / 64) * 8;
                            coolInfo(
                                this.channelNumber,
                                "Vibrato rate",
                                `${dataValue} = ${this.channelVibrato.rate}`,
                                "Hz"
                            );
                            break;
                        }

                        // Vibrato depth (custom vibrato)
                        case nonRegisteredLSB.vibratoDepth: {
                            if (dataValue === 64) {
                                return;
                            }
                            addDefaultVibrato(this);
                            this.channelVibrato.depth = dataValue / 2;
                            coolInfo(
                                this.channelNumber,
                                "Vibrato depth",
                                `${dataValue} = ${this.channelVibrato.depth}`,
                                "cents of detune"
                            );
                            break;
                        }

                        // Vibrato delay (custom vibrato)
                        case nonRegisteredLSB.vibratoDelay: {
                            if (dataValue === 64) {
                                return;
                            }
                            addDefaultVibrato(this);
                            this.channelVibrato.delay = dataValue / 64 / 3;
                            coolInfo(
                                this.channelNumber,
                                "Vibrato delay",
                                `${dataValue} = ${this.channelVibrato.delay}`,
                                "seconds"
                            );
                            break;
                        }

                        // Filter cutoff
                        case nonRegisteredLSB.TVFFilterCutoff: {
                            // Affect the "brightness" controller as we have a default modulator that controls it
                            this.controllerChange(
                                midiControllers.brightness,
                                dataValue
                            );
                            coolInfo(
                                this.channelNumber,
                                "Filter cutoff",
                                dataValue.toString(),
                                ""
                            );
                            break;
                        }

                        case nonRegisteredLSB.TVFFilterResonance: {
                            // Affect the "resonance" controller as we have a default modulator that controls it
                            this.controllerChange(
                                midiControllers.filterResonance,
                                dataValue
                            );
                            coolInfo(
                                this.channelNumber,
                                "Filter resonance",
                                dataValue.toString(),
                                ""
                            );
                            break;
                        }

                        // Attack time
                        case nonRegisteredLSB.EGAttackTime: {
                            // Affect the "attack time" controller as we have a default modulator that controls it
                            this.controllerChange(
                                midiControllers.attackTime,
                                dataValue
                            );
                            coolInfo(
                                this.channelNumber,
                                "EG attack time",
                                dataValue.toString(),
                                ""
                            );
                            break;
                        }

                        case nonRegisteredLSB.EGDecayTime: {
                            // Affect the "decay time" controller as we have a default modulator that controls it
                            this.controllerChange(
                                midiControllers.decayTime,
                                dataValue
                            );
                            coolInfo(
                                this.channelNumber,
                                "EG decay time",
                                dataValue.toString(),
                                ""
                            );
                            break;
                        }

                        // Release time
                        case nonRegisteredLSB.EGReleaseTime: {
                            // Affect the "release time" controller as we have a default modulator that controls it
                            this.controllerChange(
                                midiControllers.releaseTime,
                                dataValue
                            );
                            coolInfo(
                                this.channelNumber,
                                "EG release time",
                                dataValue.toString(),
                                ""
                            );
                            break;
                        }
                    }
                    break;
                }

                case nonRegisteredMSB.awe32: {
                    break;
                }

                // SF2 NRPN
                case nonRegisteredMSB.SF2: {
                    if (NRPNFine > 100) {
                        // Sf spec:
                        // Note that NRPN Select LSB greater than 100 are for setup only, and should not be used on their own to select a
                        // Generator parameter.
                        break;
                    }
                    const gen = this.customControllers[
                        customControllers.sf2NPRNGeneratorLSB
                    ] as GeneratorType;
                    const offset = ((dataValue << 7) | dataEntryFine) - 8192;
                    this.setGeneratorOffset(gen, offset);
                    break;
                }
            }
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
                        `%cUnrecognized RPN for %c${this.channelNumber}%c: %c(0x${rpnValue.toString(16)})%c data value: %c${dataValue}`,
                        consoleColors.warn,
                        consoleColors.recognized,
                        consoleColors.warn,
                        consoleColors.unrecognized,
                        consoleColors.warn,
                        consoleColors.value
                    );
                    break;
                }

                // Pitch wheel range
                case registeredParameterTypes.pitchWheelRange: {
                    this.midiControllers[
                        NON_CC_INDEX_OFFSET + modulatorSources.pitchWheelRange
                    ] = dataValue << 7;
                    coolInfo(
                        this.channelNumber,
                        "Pitch wheel range",
                        dataValue.toString(),
                        "semitones"
                    );
                    break;
                }

                // Coarse tuning
                case registeredParameterTypes.coarseTuning: {
                    // Semitones
                    const semitones = dataValue - 64;
                    this.setCustomController(
                        customControllers.channelTuningSemitones,
                        semitones
                    );
                    coolInfo(
                        this.channelNumber,
                        "Coarse tuning",
                        semitones.toString(),
                        "semitones"
                    );
                    break;
                }

                // Fine-tuning
                case registeredParameterTypes.fineTuning: {
                    // Note: this will not work properly unless the lsb is sent!
                    // Here we store the raw value to then adjust in fine
                    this.setTuning(dataValue - 64, false);
                    break;
                }

                // Modulation depth
                case registeredParameterTypes.modulationDepth: {
                    this.setModulationDepth(dataValue * 100);
                    break;
                }

                case registeredParameterTypes.resetParameters: {
                    this.resetParameters();
                    break;
                }
            }
        }
    }
}
