import { type SysExAcceptedArray, sysExNotRecognized } from "./helpers";
import { SpessaSynthInfo } from "../../../../utils/loggin";
import { consoleColors } from "../../../../utils/other";
import { BankSelectHacks } from "../../../../utils/midi_hacks";
import { midiControllers } from "../../../../midi/enums";
import { customControllers } from "../../../enums";
import type { SynthesizerCore } from "../../synthesizer_core";

const coolInfo = (what: string, value: string | number | boolean) => {
    SpessaSynthInfo(
        `%cYamaha XG ${what}%c for is now set to %c${value}%c.`,
        consoleColors.recognized,
        consoleColors.info,
        consoleColors.value,
        consoleColors.info
    );
};

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
        const addr1 = syx[3]; // Address 1
        const addr2 = syx[4]; // Address 2
        const addr3 = syx[5]; // Address 3
        const data = syx[6];
        // XG system parameter
        if (addr1 === 0x00 && addr2 === 0x00) {
            switch (addr3) {
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
                        coolInfo("Master Tune", cents);
                    }
                    break;
                }

                // Master volume
                case 0x04: {
                    this.setMIDIVolume(data / 127);
                    coolInfo("Master Volume", data);
                    break;
                }

                // Master attenuation
                case 0x05: {
                    const vol = 127 - data;
                    this.setMIDIVolume(vol / 127);
                    coolInfo("Master Attenuation", data);
                    break;
                }

                // Master transpose
                case 0x06: {
                    const transpose = data - 64;
                    this.setMasterParameter("transposition", transpose);
                    coolInfo("Master Transpose", transpose);
                    break;
                }

                // XG Reset
                // XG on
                case 0x7f:
                case 0x7e: {
                    SpessaSynthInfo("%cXG system on", consoleColors.info);
                    this.resetAllControllers("xg");
                    break;
                }
            }
            return;
        }
        if (addr1 === 0x02 && addr2 === 0x01) {
            let effectType: string;
            const effect = addr3;
            if (effect <= 0x15) effectType = "Reverb";
            else if (effect <= 35) effectType = "Chorus";
            else effectType = "Variation";

            SpessaSynthInfo(
                `%cUnsupported XG ${effectType} Parameter: %c${effect.toString(16)}`,
                consoleColors.warn,
                consoleColors.unrecognized
            );
            return;
        }

        if (addr1 === 0x08 /* A2 is the channel number*/) {
            // XG part parameter
            if (!BankSelectHacks.isSystemXG(this.masterParameters.midiSystem)) {
                return;
            }
            const channel = addr2 + channelOffset;
            if (channel >= this.midiChannels.length) {
                // Invalid channel
                return;
            }
            const channelObject = this.midiChannels[channel];
            switch (addr3) {
                // Bank-select MSB
                case 0x01: {
                    channelObject.controllerChange(
                        midiControllers.bankSelect,
                        data
                    );
                    break;
                }

                // Bank-select LSB
                case 0x02: {
                    channelObject.controllerChange(
                        midiControllers.bankSelectLSB,
                        data
                    );
                    break;
                }

                // Program change
                case 0x03: {
                    channelObject.programChange(data);
                    break;
                }

                // Rev. channel
                case 0x04: {
                    channelObject.rxChannel = data + channelOffset;
                    this.customChannelNumbers ||=
                        channelObject.rxChannel !== channelObject.channel;
                    coolInfo(
                        `Rev. Channel on ${channel}`,
                        channelObject.rxChannel
                    );
                    break;
                }

                // Poly/mono
                case 0x05: {
                    channelObject.polyMode = data === 1;
                    coolInfo(
                        `Mono/poly on ${channel}`,
                        channelObject.polyMode ? "POLY" : "MONO"
                    );
                    break;
                }

                // Part mode
                case 0x07: {
                    channelObject.setDrums(data != 0);
                    break;
                }

                // Note shift
                case 0x08: {
                    if (channelObject.drumChannel) {
                        break;
                    }
                    const keyShift = data - 64;
                    channelObject.setCustomController(
                        customControllers.channelKeyShift,
                        keyShift
                    );
                    coolInfo(`Key shift on ${channel}`, keyShift);
                    break;
                }

                // Volume
                case 0x0b: {
                    channelObject.controllerChange(
                        midiControllers.mainVolume,
                        data
                    );
                    break;
                }

                // Pan position
                case 0x0e: {
                    const pan = data;
                    if (pan === 0) {
                        // 0 means random
                        channelObject.randomPan = true;
                        coolInfo(`Random Pan for ${channel}`, "ON");
                    } else {
                        channelObject.controllerChange(
                            midiControllers.pan,
                            pan
                        );
                    }
                    break;
                }

                // Chorus
                case 0x12: {
                    channelObject.controllerChange(
                        midiControllers.chorusDepth,
                        data
                    );
                    break;
                }

                // Reverb
                case 0x13: {
                    channelObject.controllerChange(
                        midiControllers.reverbDepth,
                        data
                    );
                    break;
                }

                // Vibrato rate
                case 0x15: {
                    channelObject.controllerChange(
                        midiControllers.vibratoRate,
                        data
                    );
                    break;
                }

                // Vibrato depth
                case 0x16: {
                    channelObject.controllerChange(
                        midiControllers.vibratoDepth,
                        data
                    );
                    break;
                }

                // Vibrato delay
                case 0x17: {
                    channelObject.controllerChange(
                        midiControllers.vibratoDelay,
                        data
                    );
                    break;
                }

                // Filter cutoff
                case 0x18: {
                    channelObject.controllerChange(
                        midiControllers.brightness,
                        data
                    );
                    break;
                }

                // Filter resonance
                case 0x19: {
                    channelObject.controllerChange(
                        midiControllers.filterResonance,
                        data
                    );
                    break;
                }

                // Attack time
                case 0x1a: {
                    channelObject.controllerChange(
                        midiControllers.attackTime,
                        data
                    );
                    break;
                }

                // Decay time
                case 0x1b: {
                    channelObject.controllerChange(
                        midiControllers.decayTime,
                        data
                    );
                    break;
                }

                // Release time
                case 0x1c: {
                    channelObject.controllerChange(
                        midiControllers.releaseTime,
                        data
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
            return;
        }

        if (addr1 >> 4 === 3) {
            // Drum part setup
            if (this.masterParameters.drumLock) return;
            const drumKey = addr2;
            switch (addr3) {
                default: {
                    sysExNotRecognized([addr3], "Yamaha XG Drum Setup");
                    return;
                }

                case 0x00: {
                    // Drum pitch coarse
                    const pitch = (data - 64) * 100;
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].pitch = pitch;
                    }
                    coolInfo(`Drum Pitch, key ${drumKey}`, pitch);
                    break;
                }

                case 0x01: {
                    // Drum pitch fine
                    const pitch = data - 64;
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].pitch += pitch;
                    }
                    coolInfo(`Drum Pitch Fine, key ${drumKey}`, pitch);
                    break;
                }

                case 0x02: {
                    // Drum Level
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].gain = data / 120;
                    }
                    coolInfo(`Drum Level, key ${drumKey}`, data);
                    break;
                }

                case 0x03: {
                    // Drum Alternate Group (exclusive class)
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].exclusiveClass = data;
                    }
                    coolInfo(`Drum Alternate Group, key ${drumKey}`, data);
                    break;
                }

                case 0x04: {
                    // Drum Pan
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].pan = data;
                    }
                    coolInfo(`Drum Pan, key ${drumKey}`, data);
                    break;
                }

                case 0x05: {
                    // Drum Reverb
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].reverbGain = data / 127;
                    }
                    coolInfo(`Drum Reverb, key ${drumKey}`, data);
                    break;
                }

                case 0x06: {
                    // Drum Chorus
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].chorusGain = data / 127;
                    }
                    coolInfo(`Drum Chorus, key ${drumKey}`, data);
                    break;
                }

                case 0x09: {
                    // Receive note off
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].rxNoteOff = data === 1;
                    }
                    coolInfo(`Drum Note Off, key ${drumKey}`, data === 1);
                    break;
                }

                case 0x0a: {
                    // Receive note on
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].rxNoteOn = data === 1;
                    }
                    coolInfo(`Drum Note On, key ${drumKey}`, data === 1);
                    break;
                }
            }
            return;
        }

        if (
            addr1 === 0x06 || // Display letters
            addr1 === 0x07 // Display bitmap
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
