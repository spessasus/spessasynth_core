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
    const paramCoarse =
        this._midiControllers[MIDIControllers.nonRegisteredParameterMSB] >> 7;
    const paramFine =
        this._midiControllers[MIDIControllers.nonRegisteredParameterLSB] >> 7;
    const dataCoarse = dataValue >> 7;
    // Skip drums early
    if (
        this.synthCore.systemParameters.drumLock &&
        paramCoarse >= NonRegisteredMSB.drumPitch &&
        paramCoarse <= NonRegisteredMSB.drumVariation
    )
        return;
    switch (paramCoarse) {
        default: {
            SpessaLog.info(
                `%cUnrecognized NRPN for %c${this.channel}%c: %c(0x${paramCoarse
                    .toString(16)
                    .toUpperCase()} 0x${paramFine
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
            const paramLock =
                this._systemParameters.nrpnParamLock ??
                this.synthCore.systemParameters.nrpnParamLock;
            switch (paramFine) {
                default: {
                    SpessaLog.info(
                        `%cUnrecognized NRPN for %c${this.channel}%c: %c(0x${paramCoarse.toString(16)} 0x${paramFine.toString(
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
                    this.controllerChange(
                        MIDIControllers.vibratoRate,
                        dataCoarse
                    );
                    break;
                }

                // Vibrato depth
                case NonRegisteredLSB.vibratoDepth: {
                    this.controllerChange(
                        MIDIControllers.vibratoDepth,
                        dataCoarse
                    );
                    break;
                }

                // Vibrato delay
                case NonRegisteredLSB.vibratoDelay: {
                    this.controllerChange(
                        MIDIControllers.vibratoDelay,
                        dataCoarse
                    );
                    break;
                }

                // Filter cutoff
                case NonRegisteredLSB.tvfCutoffFrequency: {
                    if (paramLock) return;
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
                    if (paramLock) return;
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
                    if (paramLock) return;
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
                    if (paramLock) return;
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
                    if (paramLock) return;
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
            this.drumParams[paramFine].pitchCoarse = pitch;
            SpessaLog.coolInfo(
                `Drum ${paramFine} pitch for ${this.channel}`,
                pitch,
                "semitones"
            );
            break;
        }

        case NonRegisteredMSB.drumPitchFine: {
            const pitch = dataCoarse - 64;
            this.drumParams[paramFine].pitchFine = pitch;
            SpessaLog.coolInfo(
                `Drum ${paramFine} pitch fine for ${this.channel}`,
                pitch,
                "cents"
            );
            break;
        }

        case NonRegisteredMSB.drumLevel: {
            this.drumParams[paramFine].level = dataCoarse;
            SpessaLog.coolInfo(
                `Drum ${paramFine} level for ${this.channel}`,
                dataCoarse,
                ""
            );
            break;
        }

        case NonRegisteredMSB.drumPan: {
            this.drumParams[paramFine].pan = dataCoarse;
            SpessaLog.coolInfo(
                `Drum ${paramFine} Pan for ${this.channel}`,
                dataCoarse,
                ""
            );
            break;
        }

        case NonRegisteredMSB.drumReverb: {
            this.drumParams[paramFine].reverbSend = dataCoarse;
            SpessaLog.coolInfo(
                `Drum ${paramFine} Reverb Send for ${this.channel}`,
                dataCoarse,
                ""
            );
            break;
        }

        case NonRegisteredMSB.drumChorus: {
            this.drumParams[paramFine].chorusSend = dataCoarse;
            SpessaLog.coolInfo(
                `Drum ${paramFine} Chorus Send for ${this.channel}`,
                dataCoarse,
                ""
            );
            break;
        }

        case NonRegisteredMSB.drumVariation: {
            this.drumParams[paramFine].variationSend = dataCoarse;
            SpessaLog.coolInfo(
                `Drum ${paramFine} Variation Send for ${this.channel}`,
                dataValue,
                ""
            );
            break;
        }

        case NonRegisteredMSB.awe32: {
            handleAWE32NRPN.call(this, paramFine, dataValue);
            break;
        }

        // SF2 NRPN
        case NonRegisteredMSB.SF2: {
            if (paramFine > 100) {
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
