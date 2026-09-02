import { ConsoleColors } from "../../../utils/other";
import type { MIDIChannel } from "./midi_channel";
import type { GeneratorType } from "../../../soundbank/basic_soundbank/generator_types";
import {
    MIDIControllers,
    NonRegisteredLSB,
    NonRegisteredMSB,
    RegisteredParameterTypes
} from "../../../midi/enums";
import { SpessaLog } from "../../../utils/loggin";
import { handleAWE32NRPN } from "./awe32_nrpn";

/**
 * Executes a data entry  change for the current channel.
 */
export function dataEntry(this: MIDIChannel) {
    // Stored in cc tabled as 14-bit
    const dataValue = this._midiControllers[MIDIControllers.dataEntryMSB];

    // RPN Handling
    if (this.lastParameterIsRegistered) {
        const rpnValue =
            this._midiControllers[MIDIControllers.registeredParameterMSB] |
            (this._midiControllers[MIDIControllers.registeredParameterLSB] >>
                7);
        switch (rpnValue) {
            default: {
                SpessaLog.info(
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

            // Pitch wheel range
            case RegisteredParameterTypes.pitchWheelRange: {
                // Pitch wheel range may be a floating point number!
                // Therefore, something like "64" won't work,
                // So we divide it by 128 which is essentially the same here
                // But it allows for fractional pitch wheel range!
                const range = dataValue / 128;
                this.setMIDIParameter("pitchWheelRange", range);
                SpessaLog.coolInfo(
                    `Pitch Wheel Range for ${this.channel}`,
                    range,
                    "semitones"
                );
                break;
            }

            // Coarse tuning
            case RegisteredParameterTypes.coarseTuning: {
                // Semitones, discard LSB
                const semitones = (dataValue >> 7) - 64;
                this.setMIDIParameter("keyShift", semitones);
                SpessaLog.coolInfo(`Key shift for ${this.channel}`, semitones);
                break;
            }

            // Fine-tuning
            case RegisteredParameterTypes.fineTuning: {
                const finalTuning = dataValue - 8192;
                // Resolution is 100/8192 cents
                const cents = finalTuning / 81.92;
                this.setMIDIParameter("fineTune", cents);
                SpessaLog.coolInfo(
                    `Fine tuning for ${this.channel}`,
                    Math.round(cents),
                    "cents"
                );
                break;
            }

            // Modulation depth
            case RegisteredParameterTypes.modulationDepth: {
                // Cents, so data / 128 * 100 is data / 1.28
                const cents = dataValue / 1.28;
                this.setMIDIParameter("modulationDepth", cents);
                SpessaLog.coolInfo(
                    `Modulation depth for ${this.channel}`,
                    Math.round(cents),
                    "cents"
                );
                break;
            }

            case RegisteredParameterTypes.resetParameters: {
                // Ignore
                break;
            }
        }
        return;
    }

    // NRPN Handling
    const parameterCoarse =
        this._midiControllers[MIDIControllers.nonRegisteredParameterMSB] >> 7;
    const parameterFine =
        this._midiControllers[MIDIControllers.nonRegisteredParameterLSB] >> 7;
    if (parameterCoarse === 0x7f && parameterFine === 0x7f) {
        // Hardcoded NRPN NULL to avoid AWE32 errors
        return;
    }
    const dataCoarse = dataValue >> 7;
    // Skip drums early
    if (
        this.synthCore.systemParameters.drumLock &&
        parameterCoarse >= NonRegisteredMSB.drumPitch &&
        parameterCoarse <= NonRegisteredMSB.drumVariation
    )
        return;
    switch (parameterCoarse) {
        default: {
            SpessaLog.info(
                `%cUnrecognized NRPN for %c${this.channel}%c: %c(0x${parameterCoarse
                    .toString(16)
                    .toUpperCase()} 0x${parameterFine
                    .toString(16)
                    .toUpperCase()})%c data value: %c${dataCoarse}`,
                ConsoleColors.warn,
                ConsoleColors.recognized,
                ConsoleColors.warn,
                ConsoleColors.unrecognized,
                ConsoleColors.warn,
                ConsoleColors.value
            );
            break;
        }

        // Part parameters
        case NonRegisteredMSB.partParameter: {
            const parameterLock =
                this._systemParameters.nrpnParamLock ??
                this.synthCore.systemParameters.nrpnParamLock;
            switch (parameterFine) {
                default: {
                    SpessaLog.info(
                        `%cUnrecognized NRPN for %c${this.channel}%c: %c(0x${parameterCoarse.toString(16)} 0x${parameterFine.toString(
                            16
                        )})%c data value: %c${dataCoarse}`,
                        ConsoleColors.warn,
                        ConsoleColors.recognized,
                        ConsoleColors.warn,
                        ConsoleColors.unrecognized,
                        ConsoleColors.warn,
                        ConsoleColors.value
                    );
                    break;
                }

                // Vibrato rate
                case NonRegisteredLSB.vibratoRate: {
                    /*
                    A note on this vibrato.
                    This is a completely custom vibrato, with its own oscillator and parameters.
                    It is disabled by default via a system parameter, and when enabled,
                    it only activates when one of the NPRN messages changing it is received
                    and stays on until the next system-reset.

                    It was implemented very early in SpessaSynth's development,
                    because I wanted support for Touhou MIDIs :-)
                     */
                    if (
                        this.synthCore.systemParameters.customVibrato &&
                        !this.dynamicModulators.active
                    ) {
                        if (parameterLock || dataCoarse === 64) return;
                        this.addDefaultVibrato();
                        this.customVibrato.rate = (dataCoarse / 64) * 8;
                        SpessaLog.coolInfo(
                            `Vibrato rate for ${this.channel}`,
                            `${dataCoarse} = ${this.customVibrato.rate}`,
                            "Hz"
                        );
                    } else {
                        this.controllerChange(
                            MIDIControllers.vibratoRate,
                            dataCoarse
                        );
                    }
                    break;
                }

                // Vibrato depth
                case NonRegisteredLSB.vibratoDepth: {
                    if (
                        this.synthCore.systemParameters.customVibrato &&
                        !this.dynamicModulators.active
                    ) {
                        if (parameterLock || dataCoarse === 64) return;
                        this.addDefaultVibrato();
                        this.customVibrato.depth = dataCoarse / 2;
                        SpessaLog.coolInfo(
                            `Vibrato depth for ${this.channel}`,
                            `${dataCoarse} = ${this.customVibrato.depth}`,
                            "cents"
                        );
                    } else {
                        this.controllerChange(
                            MIDIControllers.vibratoDepth,
                            dataCoarse
                        );
                    }
                    break;
                }

                // Vibrato delay
                case NonRegisteredLSB.vibratoDelay: {
                    if (
                        this.synthCore.systemParameters.customVibrato &&
                        !this.dynamicModulators.active
                    ) {
                        if (parameterLock || dataCoarse === 64) return;
                        this.addDefaultVibrato();
                        this.customVibrato.delay = dataCoarse / 64 / 3;
                        SpessaLog.coolInfo(
                            `Vibrato delay for ${this.channel}`,
                            `${dataCoarse} = ${this.customVibrato.delay}`,
                            "seconds"
                        );
                    } else {
                        this.controllerChange(
                            MIDIControllers.vibratoDelay,
                            dataCoarse
                        );
                    }
                    break;
                }

                // Filter cutoff
                case NonRegisteredLSB.tvfCutoffFrequency: {
                    if (parameterLock) return;
                    // Affect the "brightness" controller as we have a default modulator that controls it
                    this.controllerChange(
                        MIDIControllers.brightness,
                        dataCoarse
                    );
                    SpessaLog.coolInfo(
                        `Filter cutoff for ${this.channel}`,
                        dataCoarse.toString(),
                        ""
                    );
                    break;
                }

                case NonRegisteredLSB.tvfResonance: {
                    if (parameterLock) return;
                    // Affect the "resonance" controller as we have a default modulator that controls it
                    this.controllerChange(
                        MIDIControllers.filterResonance,
                        dataCoarse
                    );
                    SpessaLog.coolInfo(
                        `Filter resonance for ${this.channel}`,
                        dataCoarse.toString(),
                        ""
                    );
                    break;
                }

                // Attack time
                case NonRegisteredLSB.envelopeAttackTime: {
                    if (parameterLock) return;
                    // Affect the "attack time" controller as we have a default modulator that controls it
                    this.controllerChange(
                        MIDIControllers.attackTime,
                        dataCoarse
                    );
                    SpessaLog.coolInfo(
                        `EG attack time for ${this.channel}`,
                        dataCoarse.toString(),
                        ""
                    );
                    break;
                }

                // Decay time
                case NonRegisteredLSB.envelopeDecayTime: {
                    if (parameterLock) return;
                    // Affect the "decay time" controller as we have a default modulator that controls it
                    this.controllerChange(
                        MIDIControllers.decayTime,
                        dataCoarse
                    );
                    SpessaLog.coolInfo(
                        `EG decay time for ${this.channel}`,
                        dataCoarse.toString(),
                        ""
                    );
                    break;
                }

                // Release time
                case NonRegisteredLSB.envelopeReleaseTime: {
                    if (parameterLock) return;
                    // Affect the "release time" controller as we have a default modulator that controls it
                    this.controllerChange(
                        MIDIControllers.releaseTime,
                        dataCoarse
                    );
                    SpessaLog.coolInfo(
                        `EG release time for ${this.channel}`,
                        dataCoarse.toString(),
                        ""
                    );
                    break;
                }
            }
            break;
        }

        case NonRegisteredMSB.drumPitch: {
            /**
             * https://github.com/spessasus/spessasynth_core/pull/58#issuecomment-3893343073
             * it's actually 50 cents! (not for XG though)
             * also if SC-55 preset is explicitly requested (MAP1 - LSB 1), it's 100 cents as well!
             */
            const pitch =
                this.channelSystem === "xg" || this.patch.bankLSB === 1
                    ? dataCoarse - 64
                    : (dataCoarse - 64) * 0.5;
            this.drumParams[parameterFine].pitchCoarse = pitch;
            SpessaLog.coolInfo(
                `Drum ${parameterFine} pitch for ${this.channel}`,
                pitch,
                "semitones"
            );
            break;
        }

        case NonRegisteredMSB.drumPitchFine: {
            const pitch = dataCoarse - 64;
            this.drumParams[parameterFine].pitchFine = pitch;
            SpessaLog.coolInfo(
                `Drum ${parameterFine} pitch fine for ${this.channel}`,
                pitch,
                "cents"
            );
            break;
        }

        case NonRegisteredMSB.drumLevel: {
            this.drumParams[parameterFine].level = dataCoarse;
            SpessaLog.coolInfo(
                `Drum ${parameterFine} level for ${this.channel}`,
                dataCoarse,
                ""
            );
            break;
        }

        case NonRegisteredMSB.drumPan: {
            this.drumParams[parameterFine].pan = dataCoarse;
            SpessaLog.coolInfo(
                `Drum ${parameterFine} Pan for ${this.channel}`,
                dataCoarse,
                ""
            );
            break;
        }

        case NonRegisteredMSB.drumReverb: {
            this.drumParams[parameterFine].reverbSend = dataCoarse;
            SpessaLog.coolInfo(
                `Drum ${parameterFine} Reverb Send for ${this.channel}`,
                dataCoarse,
                ""
            );
            break;
        }

        case NonRegisteredMSB.drumChorus: {
            this.drumParams[parameterFine].chorusSend = dataCoarse;
            SpessaLog.coolInfo(
                `Drum ${parameterFine} Chorus Send for ${this.channel}`,
                dataCoarse,
                ""
            );
            break;
        }

        case NonRegisteredMSB.drumVariation: {
            this.drumParams[parameterFine].variationSend = dataCoarse;
            SpessaLog.coolInfo(
                `Drum ${parameterFine} Variation Send for ${this.channel}`,
                dataValue,
                ""
            );
            break;
        }

        case NonRegisteredMSB.awe32: {
            handleAWE32NRPN.call(this, parameterFine, dataValue);
            break;
        }

        // SF2 NRPN
        case NonRegisteredMSB.SF2: {
            if (parameterFine > 100) {
                // Sf spec:
                // Note that NRPN Select LSB greater than 100 are for setup only, and should not be used on their own to select a
                // Generator parameter.
                break;
            }
            const gen = this.sf2NRPNGeneratorLSB as GeneratorType;
            const offset = dataValue - 8192;
            this.setGeneratorOffset(gen, offset);
            break;
        }
    }
}
