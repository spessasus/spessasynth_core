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
    drumPitch: 0x18,
    drumPitchFine: 0x19,
    drumLevel: 0x1a,
    drumPan: 0x1c,
    drumReverb: 0x1d,
    drumChorus: 0x1e,
    drumDelay: 0x1f,

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
 * @param dataCoarse The value to set for the data entry coarse controller (0-127).
 */
export function dataEntryCoarse(this: MIDIChannel, dataCoarse: number) {
    // Store in cc table
    this.midiControllers[midiControllers.dataEntryMSB] = dataCoarse << 7;
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
            const paramCoarse =
                this.midiControllers[
                    midiControllers.nonRegisteredParameterMSB
                ] >> 7;
            const paramFine =
                this.midiControllers[
                    midiControllers.nonRegisteredParameterLSB
                ] >> 7;
            const dataFine =
                this.midiControllers[midiControllers.dataEntryLSB] >> 7;
            switch (paramCoarse) {
                default: {
                    if (dataCoarse === 64) {
                        // Default value
                        return;
                    }
                    SpessaSynthInfo(
                        `%cUnrecognized NRPN for %c${this.channel}%c: %c(0x${paramFine
                            .toString(16)
                            .toUpperCase()} 0x${paramFine
                            .toString(16)
                            .toUpperCase()})%c data value: %c${dataCoarse}`,
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
                    switch (paramFine) {
                        default: {
                            if (dataCoarse === 64) {
                                // Default value
                                return;
                            }
                            SpessaSynthInfo(
                                `%cUnrecognized NRPN for %c${this.channel}%c: %c(0x${paramCoarse.toString(16)} 0x${paramFine.toString(
                                    16
                                )})%c data value: %c${dataCoarse}`,
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
                            if (dataCoarse === 64) {
                                return;
                            }
                            addDefaultVibrato(this);
                            this.channelVibrato.rate = (dataCoarse / 64) * 8;
                            coolInfo(
                                this.channel,
                                "Vibrato rate",
                                `${dataCoarse} = ${this.channelVibrato.rate}`,
                                "Hz"
                            );
                            break;
                        }

                        // Vibrato depth (custom vibrato)
                        case nonRegisteredLSB.vibratoDepth: {
                            if (dataCoarse === 64) {
                                return;
                            }
                            addDefaultVibrato(this);
                            this.channelVibrato.depth = dataCoarse / 2;
                            coolInfo(
                                this.channel,
                                "Vibrato depth",
                                `${dataCoarse} = ${this.channelVibrato.depth}`,
                                "cents of detune"
                            );
                            break;
                        }

                        // Vibrato delay (custom vibrato)
                        case nonRegisteredLSB.vibratoDelay: {
                            if (dataCoarse === 64) {
                                return;
                            }
                            addDefaultVibrato(this);
                            this.channelVibrato.delay = dataCoarse / 64 / 3;
                            coolInfo(
                                this.channel,
                                "Vibrato delay",
                                `${dataCoarse} = ${this.channelVibrato.delay}`,
                                "seconds"
                            );
                            break;
                        }

                        // Filter cutoff
                        case nonRegisteredLSB.TVFFilterCutoff: {
                            // Affect the "brightness" controller as we have a default modulator that controls it
                            this.controllerChange(
                                midiControllers.brightness,
                                dataCoarse
                            );
                            coolInfo(
                                this.channel,
                                "Filter cutoff",
                                dataCoarse.toString(),
                                ""
                            );
                            break;
                        }

                        case nonRegisteredLSB.TVFFilterResonance: {
                            // Affect the "resonance" controller as we have a default modulator that controls it
                            this.controllerChange(
                                midiControllers.filterResonance,
                                dataCoarse
                            );
                            coolInfo(
                                this.channel,
                                "Filter resonance",
                                dataCoarse.toString(),
                                ""
                            );
                            break;
                        }

                        // Attack time
                        case nonRegisteredLSB.EGAttackTime: {
                            // Affect the "attack time" controller as we have a default modulator that controls it
                            this.controllerChange(
                                midiControllers.attackTime,
                                dataCoarse
                            );
                            coolInfo(
                                this.channel,
                                "EG attack time",
                                dataCoarse.toString(),
                                ""
                            );
                            break;
                        }

                        case nonRegisteredLSB.EGDecayTime: {
                            // Affect the "decay time" controller as we have a default modulator that controls it
                            this.controllerChange(
                                midiControllers.decayTime,
                                dataCoarse
                            );
                            coolInfo(
                                this.channel,
                                "EG decay time",
                                dataCoarse.toString(),
                                ""
                            );
                            break;
                        }

                        // Release time
                        case nonRegisteredLSB.EGReleaseTime: {
                            // Affect the "release time" controller as we have a default modulator that controls it
                            this.controllerChange(
                                midiControllers.releaseTime,
                                dataCoarse
                            );
                            coolInfo(
                                this.channel,
                                "EG release time",
                                dataCoarse.toString(),
                                ""
                            );
                            break;
                        }
                    }
                    break;
                }

                case nonRegisteredMSB.drumPitch: {
                    /**
                     * https://github.com/spessasus/spessasynth_core/pull/58#issuecomment-3893343073
                     * it's actually 50 cents! (not for XG though)
                     */
                    const pitch =
                        this.channelSystem === "xg"
                            ? (dataCoarse - 64) * 100
                            : (dataCoarse - 64) * 50;
                    this.drumParams[paramFine].pitch = pitch;
                    coolInfo(
                        this.channel,
                        `Drum ${paramFine} pitch`,
                        pitch,
                        "cents"
                    );
                    break;
                }

                case nonRegisteredMSB.drumPitchFine: {
                    const pitch = dataCoarse - 64;
                    this.drumParams[paramFine].pitch += pitch;
                    coolInfo(
                        this.channel,
                        `Drum ${paramFine} pitch fine`,
                        this.drumParams[paramFine].pitch,
                        "cents"
                    );
                    break;
                }

                case nonRegisteredMSB.drumLevel: {
                    this.drumParams[paramFine].gain = dataCoarse / 120;
                    coolInfo(
                        this.channel,
                        `Drum ${paramFine} level`,
                        dataCoarse,
                        ""
                    );
                    break;
                }

                case nonRegisteredMSB.drumPan: {
                    this.drumParams[paramFine].pan = dataCoarse;
                    coolInfo(
                        this.channel,
                        `Drum ${paramFine} pan`,
                        dataCoarse,
                        ""
                    );
                    break;
                }

                case nonRegisteredMSB.drumReverb: {
                    this.drumParams[paramFine].reverbGain = dataCoarse / 127;
                    coolInfo(
                        this.channel,
                        `Drum ${paramFine} reverb level`,
                        dataCoarse,
                        ""
                    );
                    break;
                }

                case nonRegisteredMSB.drumChorus: {
                    this.drumParams[paramFine].chorusGain = dataCoarse / 127;
                    coolInfo(
                        this.channel,
                        `Drum ${paramFine} chorus level`,
                        dataCoarse,
                        ""
                    );
                    break;
                }

                case nonRegisteredMSB.awe32: {
                    break;
                }

                // SF2 NRPN
                case nonRegisteredMSB.SF2: {
                    if (paramFine > 100) {
                        // Sf spec:
                        // Note that NRPN Select LSB greater than 100 are for setup only, and should not be used on their own to select a
                        // Generator parameter.
                        break;
                    }
                    const gen = this.customControllers[
                        customControllers.sf2NPRNGeneratorLSB
                    ] as GeneratorType;
                    const offset = ((dataCoarse << 7) | dataFine) - 8192;
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
                        `%cUnrecognized RPN for %c${this.channel}%c: %c(0x${rpnValue.toString(16)})%c data value: %c${dataCoarse}`,
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
                    ] = dataCoarse << 7;
                    coolInfo(
                        this.channel,
                        "Pitch wheel range",
                        dataCoarse.toString(),
                        "semitones"
                    );
                    break;
                }

                // Coarse tuning
                case registeredParameterTypes.coarseTuning: {
                    // Semitones
                    const semitones = dataCoarse - 64;
                    this.setCustomController(
                        customControllers.channelTuningSemitones,
                        semitones
                    );
                    coolInfo(
                        this.channel,
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
                    this.setTuning(dataCoarse - 64, false);
                    break;
                }

                // Modulation depth
                case registeredParameterTypes.modulationDepth: {
                    this.setModulationDepth(dataCoarse * 100);
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
