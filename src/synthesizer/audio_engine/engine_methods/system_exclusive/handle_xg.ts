import { type SysExAcceptedArray, sysExNotRecognized } from "./helpers";
import { SpessaSynthInfo } from "../../../../utils/loggin";
import { consoleColors } from "../../../../utils/other";
import { BankSelectHacks } from "../../../../utils/midi_hacks";
import { midiControllers } from "../../../../midi/enums";
import { customControllers } from "../../../enums";
import type { SynthesizerCore } from "../../synthesizer_core";

/**
 * Handles a XG system exclusive
 * http://www.studio4all.de/htmle/main91.html
 * @param syx
 * @param channelOffset
 */
export function handleXG(
    this: SynthesizerCore,
    syx: SysExAcceptedArray,
    channelOffset = 0
) {
    // XG sysex
    if (syx[2] === 0x4c) {
        const a1 = syx[3]; // Address 1
        const a2 = syx[4]; // Address 2
        // XG system parameter
        if (a1 === 0x00 && a2 === 0x00) {
            switch (syx[5]) {
                // Master tune
                case 0x00: {
                    {
                        const tune =
                            ((syx[6] & 15) << 12) |
                            ((syx[7] & 15) << 8) |
                            ((syx[8] & 15) << 4) |
                            (syx[9] & 15);
                        const cents = (tune - 1024) / 10;
                        this.setMasterTuning(cents);
                        SpessaSynthInfo(
                            `%cXG master tune. Cents: %c${cents}`,
                            consoleColors.info,
                            consoleColors.recognized
                        );
                    }
                    break;
                }

                // Master volume
                case 0x04: {
                    const vol = syx[6];
                    this.setMIDIVolume(vol / 127);
                    SpessaSynthInfo(
                        `%cXG master volume. Volume: %c${vol}`,
                        consoleColors.info,
                        consoleColors.recognized
                    );
                    break;
                }

                // Master attenuation
                case 0x05: {
                    const vol = 127 - syx[6];
                    this.setMIDIVolume(vol / 127);
                    SpessaSynthInfo(
                        `%cXG master attenuation. Volume: %c${vol}`,
                        consoleColors.info,
                        consoleColors.recognized
                    );
                    break;
                }

                // Master transpose
                case 0x06: {
                    const transpose = syx[6] - 64;
                    this.setMasterParameter("transposition", transpose);
                    SpessaSynthInfo(
                        `%cXG master transpose. Volume: %c${transpose}`,
                        consoleColors.info,
                        consoleColors.recognized
                    );
                    break;
                }

                //
                // XG on
                case 0x7e: {
                    SpessaSynthInfo("%cXG system on", consoleColors.info);
                    this.resetAllControllers("xg");
                    break;
                }
            }
        } else if (a1 === 0x02 && a2 === 0x01) {
            let effectType: string;
            const effect = syx[5];
            if (effect <= 0x15) effectType = "Reverb";
            else if (effect <= 35) effectType = "Chorus";
            else effectType = "Variation";

            SpessaSynthInfo(
                `%cUnsupported XG ${effectType} Parameter: %c${effect.toString(16)}`,
                consoleColors.warn,
                consoleColors.unrecognized
            );
        } else if (a1 === 0x08 /* A2 is the channel number*/) {
            // XG part parameter
            if (!BankSelectHacks.isSystemXG(this.masterParameters.midiSystem)) {
                return;
            }
            const channel = a2 + channelOffset;
            if (channel >= this.midiChannels.length) {
                // Invalid channel
                return;
            }
            const channelObject = this.midiChannels[channel];
            const value = syx[6];
            switch (syx[5]) {
                // Bank-select MSB
                case 0x01: {
                    channelObject.controllerChange(
                        midiControllers.bankSelect,
                        value
                    );
                    break;
                }

                // Bank-select LSB
                case 0x02: {
                    channelObject.controllerChange(
                        midiControllers.bankSelectLSB,
                        value
                    );
                    break;
                }

                // Program change
                case 0x03: {
                    channelObject.programChange(value);
                    break;
                }

                // Part mode
                case 0x07: {
                    channelObject.setDrums(value != 0);
                    break;
                }

                // Note shift
                case 0x08: {
                    if (channelObject.drumChannel) {
                        break;
                    }
                    channelObject.setCustomController(
                        customControllers.channelKeyShift,
                        value - 64
                    );
                    break;
                }

                // Volume
                case 0x0b: {
                    channelObject.controllerChange(
                        midiControllers.mainVolume,
                        value
                    );
                    break;
                }

                // Pan position
                case 0x0e: {
                    const pan = value;
                    if (pan === 0) {
                        // 0 means random
                        channelObject.randomPan = true;
                        SpessaSynthInfo(
                            `%cRandom pan is set to %cON%c for %c${channel}`,
                            consoleColors.info,
                            consoleColors.recognized,
                            consoleColors.info,
                            consoleColors.value
                        );
                    } else {
                        channelObject.controllerChange(
                            midiControllers.pan,
                            pan
                        );
                    }
                    break;
                }
                // Dry
                case 0x11: {
                    channelObject.controllerChange(
                        midiControllers.mainVolume,
                        value
                    );
                    break;
                }

                // Chorus
                case 0x12: {
                    channelObject.controllerChange(
                        midiControllers.chorusDepth,
                        value
                    );
                    break;
                }

                // Reverb
                case 0x13: {
                    channelObject.controllerChange(
                        midiControllers.reverbDepth,
                        value
                    );
                    break;
                }

                // Vibrato rate
                case 0x15: {
                    channelObject.controllerChange(
                        midiControllers.vibratoRate,
                        value
                    );
                    break;
                }

                // Vibrato depth
                case 0x16: {
                    channelObject.controllerChange(
                        midiControllers.vibratoDepth,
                        value
                    );
                    break;
                }

                // Vibrato delay
                case 0x17: {
                    channelObject.controllerChange(
                        midiControllers.vibratoDelay,
                        value
                    );
                    break;
                }

                // Filter cutoff
                case 0x18: {
                    channelObject.controllerChange(
                        midiControllers.brightness,
                        value
                    );
                    break;
                }

                // Filter resonance
                case 0x19: {
                    channelObject.controllerChange(
                        midiControllers.filterResonance,
                        value
                    );
                    break;
                }

                // Attack time
                case 0x1a: {
                    channelObject.controllerChange(
                        midiControllers.attackTime,
                        value
                    );
                    break;
                }

                // Decay time
                case 0x1b: {
                    channelObject.controllerChange(
                        midiControllers.decayTime,
                        value
                    );
                    break;
                }

                // Release time
                case 0x1c: {
                    channelObject.controllerChange(
                        midiControllers.releaseTime,
                        value
                    );
                    break;
                }

                default: {
                    SpessaSynthInfo(
                        `%cUnsupported Yamaha XG Part Setup: %c${syx[5]
                            .toString(16)
                            .toUpperCase()}%c for channel ${channel}`,
                        consoleColors.warn,
                        consoleColors.unrecognized,
                        consoleColors.warn
                    );
                }
            }
        } else if (
            a1 === 0x06 || // Display letters
            a1 === 0x07 // Display bitmap
        ) {
            // Displayed letters
            this.callEvent("synthDisplay", [...syx]);
        } else if (
            BankSelectHacks.isSystemXG(this.masterParameters.midiSystem)
        ) {
            sysExNotRecognized(syx, "Yamaha XG");
        }
    } else {
        sysExNotRecognized(syx, "Yamaha");
    }
}
