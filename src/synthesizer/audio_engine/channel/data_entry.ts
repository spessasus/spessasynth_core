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
                this.pitchWheelRange(dataValue / 128);
                break;
            }

            // Coarse tuning
            case RegisteredParameterTypes.coarseTuning: {
                // Semitones, discard LSB
                const semitones = (dataValue >> 7) - 64;
                this.keyShift(semitones);
                break;
            }

            // Fine-tuning
            case RegisteredParameterTypes.fineTuning: {
                const finalTuning = dataValue - 8192;
                // Resolution is 100/8192 cents
                this.fineTune(finalTuning / 81.92);
                break;
            }

            // Modulation depth
            case RegisteredParameterTypes.modulationDepth: {
                // Cents, so data / 128 * 100 is data / 1.28
                this.modulationDepth(dataValue / 1.28);
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
        paramCoarse <= NonRegisteredMSB.drumDelay
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
            const vibratoLock =
                (this._systemParameters.customVibratoLock ??
                    this.synthCore.systemParameters.customVibratoLock) ||
                paramLock;
            switch (paramFine) {
                /*
                A note on this vibrato.
                This is a completely custom vibrato, with its own oscillator and parameters.
                It is disabled by default,
                only being enabled when one of the NRPN messages changing it is received
                and stays on until the next system-reset.
                It was implemented very early in SpessaSynth's development,
                because I wanted support for Touhou MIDIs :-)
                 */
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

                // Vibrato rate (custom vibrato)
                case NonRegisteredLSB.vibratoRate: {
                    if (this.dynamicModulators.active) {
                        this.controllerChange(
                            MIDIControllers.vibratoRate,
                            dataCoarse
                        );
                        return;
                    }
                    if (vibratoLock || dataCoarse === 64) return;

                    this.addDefaultVibrato();
                    this.vibrato.rate = (dataCoarse / 64) * 8;
                    SpessaLog.coolInfo(
                        `Vibrato rate for ${this.channel}`,
                        `${dataCoarse} = ${this.vibrato.rate}`,
                        "Hz"
                    );
                    break;
                }

                // Vibrato depth (custom vibrato)
                case NonRegisteredLSB.vibratoDepth: {
                    if (vibratoLock || dataCoarse === 64) return;

                    this.addDefaultVibrato();
                    this.vibrato.depth = dataCoarse / 2;
                    SpessaLog.coolInfo(
                        `Vibrato depth for ${this.channel}`,
                        `${dataCoarse} = ${this.vibrato.depth}`,
                        "cents of detune"
                    );
                    break;
                }

                // Vibrato delay (custom vibrato)
                case NonRegisteredLSB.vibratoDelay: {
                    if (vibratoLock || dataCoarse === 64) return;

                    this.addDefaultVibrato();
                    this.vibrato.delay = dataCoarse / 64 / 3;
                    SpessaLog.coolInfo(
                        `Vibrato delay for ${this.channel}`,
                        `${dataCoarse} = ${this.vibrato.delay}`,
                        "seconds"
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
                    ? (dataCoarse - 64) * 100
                    : (dataCoarse - 64) * 50;
            this.drumParams[paramFine].pitch = pitch;
            SpessaLog.coolInfo(
                `Drum ${paramFine} pitch for ${this.channel}`,
                pitch,
                "cents"
            );
            break;
        }

        case NonRegisteredMSB.drumPitchFine: {
            const pitch = dataCoarse - 64;
            this.drumParams[paramFine].pitch += pitch;
            SpessaLog.coolInfo(
                `Drum ${paramFine} pitch fine for ${this.channel}`,
                this.drumParams[paramFine].pitch,
                "cents"
            );
            break;
        }

        case NonRegisteredMSB.drumLevel: {
            this.drumParams[paramFine].gain = dataCoarse / 120;
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
                `Drum ${paramFine} pan for ${this.channel}`,
                dataCoarse,
                ""
            );
            break;
        }

        case NonRegisteredMSB.drumReverb: {
            this.drumParams[paramFine].reverbGain = dataCoarse / 127;
            SpessaLog.coolInfo(
                `Drum ${paramFine} reverb level for ${this.channel}`,
                dataCoarse,
                ""
            );
            break;
        }

        case NonRegisteredMSB.drumChorus: {
            this.drumParams[paramFine].chorusGain = dataCoarse / 127;
            SpessaLog.coolInfo(
                `Drum ${paramFine} chorus level for ${this.channel}`,
                dataCoarse,
                ""
            );
            break;
        }

        case NonRegisteredMSB.drumDelay: {
            this.drumParams[paramFine].delayGain = dataCoarse / 127;
            SpessaLog.coolInfo(
                `Drum ${paramFine} delay level for ${this.channel}`,
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
