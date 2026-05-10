import { ConsoleColors } from "../../../../utils/other";
import type { MIDIChannel } from "../midi_channel";
import type { GeneratorType } from "../../../../soundbank/basic_soundbank/generator_types";
import {
    MIDIControllers,
    NonRegisteredLSB,
    NonRegisteredMSB,
    RegisteredParameterTypes
} from "../../../../midi/enums";
import { SpessaLog } from "../../../../utils/loggin";

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
    SpessaLog.info(
        `%c${what} for %c${chanNum}%c is now set to %c${value}%c${type}.`,
        ConsoleColors.info,
        ConsoleColors.recognized,
        ConsoleColors.info,
        ConsoleColors.value,
        ConsoleColors.info
    );
};

/**
 * Executes a data entry coarse (MSB) change for the current channel.
 * @param dataCoarse The value to set for the data entry coarse controller (0-127).
 */
export function dataEntryCoarse(this: MIDIChannel, dataCoarse: number) {
    // Store in cc table
    this.midiControllers[MIDIControllers.dataEntryMSB] = dataCoarse << 7;
    /*
    A note on this vibrato.
    This is a completely custom vibrato, with its own oscillator and parameters.
    It is disabled by default,
    only being enabled when one of the NRPN messages changing it is received
    and stays on until the next system-reset.
    It was implemented very early in SpessaSynth's development,
    because I wanted support for Touhou MIDIs :-)
     */
    // RPN Handling
    if (this.lastParameterIsRegistered) {
        const rpnValue =
            this.midiControllers[MIDIControllers.registeredParameterMSB] |
            (this.midiControllers[MIDIControllers.registeredParameterLSB] >> 7);
        switch (rpnValue) {
            default: {
                SpessaLog.info(
                    `%cUnrecognized RPN for %c${this.channel}%c: %c(0x${rpnValue.toString(16)})%c data value: %c${dataCoarse}`,
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
                this.pitchWheelRange(dataCoarse);
                break;
            }

            // Coarse tuning
            case RegisteredParameterTypes.coarseTuning: {
                // Semitones
                const semitones = dataCoarse - 64;
                this.keyShift(semitones);
                break;
            }

            // Fine-tuning
            case RegisteredParameterTypes.fineTuning: {
                // Note: this will not work properly unless the lsb is sent!
                // Here we store the raw value to then adjust in fine
                this.fineTune(dataCoarse - 64, false);
                break;
            }

            // Modulation depth
            case RegisteredParameterTypes.modulationDepth: {
                this.modulationDepth(dataCoarse * 100);
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
        this.midiControllers[MIDIControllers.nonRegisteredParameterMSB] >> 7;
    const paramFine =
        this.midiControllers[MIDIControllers.nonRegisteredParameterLSB] >> 7;
    const dataFine = this.midiControllers[MIDIControllers.dataEntryLSB] >> 7;
    // Skip drums early
    if (
        this.synthCore.masterParameters.drumLock &&
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
            const paramLock = this.synthCore.masterParameters.nrpnParamLock;
            const vibratoLock =
                this.synthCore.masterParameters.customVibratoLock || paramLock;
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

                // Vibrato rate (custom vibrato)
                case NonRegisteredLSB.vibratoRate: {
                    if (this.sysExModulators.active) {
                        this.controllerChange(
                            MIDIControllers.vibratoRate,
                            dataCoarse
                        );
                        return;
                    }
                    if (vibratoLock || dataCoarse === 64) return;

                    this.addDefaultVibrato();
                    this.vibrato.rate = (dataCoarse / 64) * 8;
                    coolInfo(
                        this.channel,
                        "Vibrato rate",
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
                    coolInfo(
                        this.channel,
                        "Vibrato depth",
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
                    coolInfo(
                        this.channel,
                        "Vibrato delay",
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
                    coolInfo(
                        this.channel,
                        "Filter cutoff",
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
                    coolInfo(
                        this.channel,
                        "Filter resonance",
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
                    coolInfo(
                        this.channel,
                        "EG attack time",
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
                    coolInfo(
                        this.channel,
                        "EG decay time",
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
            coolInfo(this.channel, `Drum ${paramFine} pitch`, pitch, "cents");
            break;
        }

        case NonRegisteredMSB.drumPitchFine: {
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

        case NonRegisteredMSB.drumLevel: {
            this.drumParams[paramFine].gain = dataCoarse / 120;
            coolInfo(this.channel, `Drum ${paramFine} level`, dataCoarse, "");
            break;
        }

        case NonRegisteredMSB.drumPan: {
            this.drumParams[paramFine].pan = dataCoarse;
            coolInfo(this.channel, `Drum ${paramFine} pan`, dataCoarse, "");
            break;
        }

        case NonRegisteredMSB.drumReverb: {
            this.drumParams[paramFine].reverbGain = dataCoarse / 127;
            coolInfo(
                this.channel,
                `Drum ${paramFine} reverb level`,
                dataCoarse,
                ""
            );
            break;
        }

        case NonRegisteredMSB.drumChorus: {
            this.drumParams[paramFine].chorusGain = dataCoarse / 127;
            coolInfo(
                this.channel,
                `Drum ${paramFine} chorus level`,
                dataCoarse,
                ""
            );
            break;
        }

        case NonRegisteredMSB.drumDelay: {
            this.drumParams[paramFine].delayGain = dataCoarse / 127;
            coolInfo(
                this.channel,
                `Drum ${paramFine} delay level`,
                dataCoarse,
                ""
            );
            break;
        }

        case NonRegisteredMSB.awe32: {
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
            const offset = ((dataCoarse << 7) | dataFine) - 8192;
            this.setGeneratorOffset(gen, offset);
            break;
        }
    }
}
