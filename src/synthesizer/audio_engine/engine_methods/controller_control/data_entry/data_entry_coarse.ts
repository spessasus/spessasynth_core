import { SpessaSynthInfo, SpessaSynthWarn } from "../../../../../utils/loggin";
import { consoleColors } from "../../../../../utils/other";
import type { MIDIChannel } from "../../../engine_components/midi_channel";
import type { GeneratorType } from "../../../../../soundbank/basic_soundbank/generator_types";
import { NON_CC_INDEX_OFFSET } from "../../../engine_components/controller_tables";
import { modulatorSources } from "../../../../../soundbank/enums";
import { customControllers, dataEntryStates } from "../../../../enums";
import { midiControllers } from "../../../../../midi/enums";

export const registeredParameterTypes = {
    pitchBendRange: 0x0000,
    fineTuning: 0x0001,
    coarseTuning: 0x0002,
    modulationDepth: 0x0005,
    resetParameters: 0x3fff
};

export const nonRegisteredMSB = {
    partParameter: 0x01,
    awe32: 0x7f,
    SF2: 120
};

/**
 * https://cdn.roland.com/assets/media/pdf/SC-88PRO_OM.pdf
 * http://hummer.stanford.edu/sig/doc/classes/MidiOutput/rpn.html
 * @enum {number}
 */
const nonRegisteredGSLSB = {
    vibratoRate: 0x08,
    vibratoDepth: 0x09,
    vibratoDelay: 0x0a,

    TVFFilterCutoff: 0x20,
    TVFFilterResonance: 0x21,

    EGAttackTime: 0x63,
    EGReleaseTime: 0x66
};

/**
 * Executes a data entry coarse (MSB) change for the current channel.
 * @param dataValue The value to set for the data entry coarse controller (0-127).
 */
export function dataEntryCoarse(this: MIDIChannel, dataValue: number) {
    // Store in cc table
    this.midiControllers[midiControllers.dataEntryMsb] = dataValue << 7;
    /*
    A note on this vibrato.
    This is a completely custom vibrato, with its own oscillator and parameters.
    It is disabled by default,
    only being enabled when one of the NPRN messages changing it is received
    and stays on until the next system-reset.
    It was implemented very early in SpessaSynth's development,
    because I wanted support for Touhou MIDIs :-)
     */
    const addDefaultVibrato = () => {
        if (
            this.channelVibrato.delay === 0 &&
            this.channelVibrato.rate === 0 &&
            this.channelVibrato.depth === 0
        ) {
            this.channelVibrato.depth = 50;
            this.channelVibrato.rate = 8;
            this.channelVibrato.delay = 0.6;
        }
    };

    // A helper function to log info in a nice way
    const coolInfo = (what: string, value: string | number, type: string) => {
        if (type.length > 0) {
            type = " " + type;
        }
        SpessaSynthInfo(
            `%c${what} for %c${this.channelNumber}%c is now set to %c${value}%c${type}.`,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            consoleColors.value,
            consoleColors.info
        );
    };
    switch (this.dataEntryState) {
        default:
        case dataEntryStates.Idle:
            break;

        // Process GS NRPNs
        case dataEntryStates.NRPFine: {
            if (this.lockGSNRPNParams) {
                return;
            }
            const NRPNCoarse =
                this.midiControllers[midiControllers.NRPNMsb] >> 7;
            const NRPNFine = this.midiControllers[midiControllers.NRPNLsb] >> 7;
            const dataEntryFine =
                this.midiControllers[midiControllers.lsbForControl6DataEntry] >>
                7;
            switch (NRPNCoarse) {
                default:
                    if (dataValue === 64) {
                        // Default value
                        return;
                    }
                    SpessaSynthWarn(
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

                // Part parameters: vibrato, cutoff
                case nonRegisteredMSB.partParameter:
                    switch (NRPNFine) {
                        default:
                            if (dataValue === 64) {
                                // Default value
                                return;
                            }
                            SpessaSynthWarn(
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

                        // Vibrato rate
                        case nonRegisteredGSLSB.vibratoRate:
                            if (dataValue === 64) {
                                return;
                            }
                            addDefaultVibrato();
                            this.channelVibrato.rate = (dataValue / 64) * 8;
                            coolInfo(
                                "Vibrato rate",
                                `${dataValue} = ${this.channelVibrato.rate}`,
                                "Hz"
                            );
                            break;

                        // Vibrato depth
                        case nonRegisteredGSLSB.vibratoDepth:
                            if (dataValue === 64) {
                                return;
                            }
                            addDefaultVibrato();
                            this.channelVibrato.depth = dataValue / 2;
                            coolInfo(
                                "Vibrato depth",
                                `${dataValue} = ${this.channelVibrato.depth}`,
                                "cents of detune"
                            );
                            break;

                        // Vibrato delay
                        case nonRegisteredGSLSB.vibratoDelay:
                            if (dataValue === 64) {
                                return;
                            }
                            addDefaultVibrato();
                            this.channelVibrato.delay = dataValue / 64 / 3;
                            coolInfo(
                                "Vibrato delay",
                                `${dataValue} = ${this.channelVibrato.delay}`,
                                "seconds"
                            );
                            break;

                        // Filter cutoff
                        case nonRegisteredGSLSB.TVFFilterCutoff:
                            // Affect the "brightness" controller as we have a default modulator that controls it
                            this.controllerChange(
                                midiControllers.brightness,
                                dataValue
                            );
                            coolInfo("Filter cutoff", dataValue.toString(), "");
                            break;

                        // Attack time
                        case nonRegisteredGSLSB.EGAttackTime:
                            // Affect the "attack time" controller as we have a default modulator that controls it
                            this.controllerChange(
                                midiControllers.attackTime,
                                dataValue
                            );
                            coolInfo(
                                "EG attack time",
                                dataValue.toString(),
                                ""
                            );
                            break;

                        // Release time
                        case nonRegisteredGSLSB.EGReleaseTime:
                            // Affect the "release time" controller as we have a default modulator that controls it
                            this.controllerChange(
                                midiControllers.releaseTime,
                                dataValue
                            );
                            coolInfo(
                                "EG release time",
                                dataValue.toString(),
                                ""
                            );
                            break;
                    }
                    break;

                case nonRegisteredMSB.awe32:
                    break;

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
                this.midiControllers[midiControllers.RPNMsb] |
                (this.midiControllers[midiControllers.RPNLsb] >> 7);
            switch (rpnValue) {
                default:
                    SpessaSynthWarn(
                        `%cUnrecognized RPN for %c${this.channelNumber}%c: %c(0x${rpnValue.toString(16)})%c data value: %c${dataValue}`,
                        consoleColors.warn,
                        consoleColors.recognized,
                        consoleColors.warn,
                        consoleColors.unrecognized,
                        consoleColors.warn,
                        consoleColors.value
                    );
                    break;

                // Pitch bend range
                case registeredParameterTypes.pitchBendRange:
                    this.midiControllers[
                        NON_CC_INDEX_OFFSET + modulatorSources.pitchWheelRange
                    ] = dataValue << 7;
                    coolInfo(
                        "Pitch bend range",
                        dataValue.toString(),
                        "semitones"
                    );
                    break;

                // Coarse tuning
                case registeredParameterTypes.coarseTuning: {
                    // Semitones
                    const semitones = dataValue - 64;
                    this.setCustomController(
                        customControllers.channelTuningSemitones,
                        semitones
                    );
                    coolInfo(
                        "Coarse tuning",
                        semitones.toString(),
                        "semitones"
                    );
                    break;
                }

                // Fine-tuning
                case registeredParameterTypes.fineTuning:
                    // Note: this will not work properly unless the lsb is sent!
                    // Here we store the raw value to then adjust in fine
                    this.setTuning(dataValue - 64, false);
                    break;

                // Modulation depth
                case registeredParameterTypes.modulationDepth:
                    this.setModulationDepth(dataValue * 100);
                    break;

                case registeredParameterTypes.resetParameters:
                    this.resetParameters();
                    break;
            }
        }
    }
}
