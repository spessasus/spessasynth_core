import { type SysExAcceptedArray, sysExNotRecognized } from "./helpers";
import { SpessaSynthLog } from "../../../utils/loggin";
import { ConsoleColors } from "../../../utils/other";
import { MIDIControllers } from "../../../midi/enums";
import type { SynthesizerCore } from "../synthesizer_core";

const coolInfo = (what: string, value: string | number | boolean) => {
    SpessaSynthLog.info(
        `%cYamaha XG ${what}%c for is now set to %c${value}%c.`,
        ConsoleColors.recognized,
        ConsoleColors.info,
        ConsoleColors.value,
        ConsoleColors.info
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
        const a1 = syx[3]; // Address 1
        const a2 = syx[4]; // Address 2
        const a3 = syx[5]; // Address 3
        const data = syx[6];
        // XG system parameter
        if (a1 === 0x00 && a2 === 0x00) {
            switch (a3) {
                // Master tune
                case 0x00: {
                    {
                        const tune =
                            ((syx[6] & 15) << 12) |
                            ((syx[7] & 15) << 8) |
                            ((syx[8] & 15) << 4) |
                            (syx[9] & 15);
                        const cents = (tune - 1024) / 10;
                        this.setMIDIParameter("masterTune", cents);
                        coolInfo("Master Tune", cents);
                    }
                    break;
                }

                // Master volume
                case 0x04: {
                    this.setMIDIParameter("masterVolume", data / 127);
                    coolInfo("Master Volume", data);
                    break;
                }

                // Master attenuation
                case 0x05: {
                    const vol = 127 - data;
                    this.setMIDIParameter("masterVolume", vol / 127);
                    coolInfo("Master Attenuation", data);
                    break;
                }

                // Master transpose
                case 0x06: {
                    const transpose = data - 64;
                    this.setMIDIParameter("masterKeyShift", transpose);
                    coolInfo("Master Transpose", transpose);
                    break;
                }

                // XG Reset
                // XG on
                case 0x7f:
                case 0x7e: {
                    SpessaSynthLog.info("%cXG system on", ConsoleColors.info);
                    this.resetAllControllers("xg");
                    break;
                }
            }
            return;
        }
        if (a1 === 0x02 && a2 === 0x01) {
            let effectType: string;
            const effect = a3;
            if (effect <= 0x15) effectType = "Reverb";
            else if (effect <= 0x35) effectType = "Chorus";
            else effectType = "Variation";

            SpessaSynthLog.info(
                `%cUnsupported XG ${effectType} Parameter: %c${effect.toString(16)}`,
                ConsoleColors.warn,
                ConsoleColors.unrecognized
            );
            return;
        }

        if (a1 === 0x08 /* A2 is the channel number*/) {
            const channel = a2 + channelOffset;
            if (channel >= this.midiChannels.length) {
                // Invalid channel
                SpessaSynthLog.info(
                    `%cDiscarding XG SysEx with invalid part number:%c ${channel}`,
                    ConsoleColors.warn,
                    ConsoleColors.unrecognized
                );
                return;
            }
            const ch = this.midiChannels[channel];
            switch (a3) {
                default: {
                    SpessaSynthLog.info(
                        `%cUnsupported Yamaha XG Part Setup: %c${syx[5]
                            .toString(16)
                            .toUpperCase()}%c for channel ${channel}`,
                        ConsoleColors.warn,
                        ConsoleColors.unrecognized,
                        ConsoleColors.warn
                    );
                    break;
                }

                // Bank-select MSB
                case 0x01: {
                    ch.controllerChange(MIDIControllers.bankSelect, data);
                    break;
                }

                // Bank-select LSB
                case 0x02: {
                    ch.controllerChange(MIDIControllers.bankSelectLSB, data);
                    break;
                }

                // Program change
                case 0x03: {
                    ch.programChange(data);
                    break;
                }

                // Rev. channel
                case 0x04: {
                    const rxChannel = data + channelOffset;
                    ch.setMIDIParameter("rxChannel", rxChannel);
                    this.customChannelNumbers ||= rxChannel !== ch.channel;
                    coolInfo(`Rev. Channel on ${channel}`, rxChannel);
                    break;
                }

                // Poly/mono
                case 0x05: {
                    const poly = data === 1;
                    ch.setMIDIParameter("polyMode", poly);
                    coolInfo(`Mono/poly on ${channel}`, poly ? "POLY" : "MONO");
                    break;
                }

                // Part mode
                case 0x07: {
                    ch.setDrums(data !== 0);
                    break;
                }

                // Note shift
                case 0x08: {
                    if (ch.drumChannel) break;
                    const keyShift = data - 64;
                    ch.setMIDIParameter("keyShift", keyShift);
                    coolInfo(`Key shift on ${channel}`, keyShift);
                    break;
                }

                // Volume
                case 0x0b: {
                    ch.controllerChange(MIDIControllers.mainVolume, data);
                    break;
                }

                // Pan position
                case 0x0e: {
                    const pan = data;
                    const randomPan = pan === 0;
                    ch.setMIDIParameter("randomPan", randomPan);
                    if (randomPan)
                        // 0 means random
                        coolInfo(`Random Pan for ${channel}`, "ON");
                    else ch.controllerChange(MIDIControllers.pan, pan);

                    break;
                }

                // Chorus
                case 0x12: {
                    ch.controllerChange(MIDIControllers.chorusDepth, data);
                    break;
                }

                // Reverb
                case 0x13: {
                    ch.controllerChange(MIDIControllers.reverbDepth, data);
                    break;
                }

                // Vibrato rate
                case 0x15: {
                    ch.controllerChange(MIDIControllers.vibratoRate, data);
                    break;
                }

                // Vibrato depth
                case 0x16: {
                    ch.controllerChange(MIDIControllers.vibratoDepth, data);
                    break;
                }

                // Vibrato delay
                case 0x17: {
                    ch.controllerChange(MIDIControllers.vibratoDelay, data);
                    break;
                }

                // Filter cutoff
                case 0x18: {
                    ch.controllerChange(MIDIControllers.brightness, data);
                    break;
                }

                // Filter resonance
                case 0x19: {
                    ch.controllerChange(MIDIControllers.filterResonance, data);
                    break;
                }

                // Attack time
                case 0x1a: {
                    ch.controllerChange(MIDIControllers.attackTime, data);
                    break;
                }

                // Decay time
                case 0x1b: {
                    ch.controllerChange(MIDIControllers.decayTime, data);
                    break;
                }

                // Release time
                case 0x1c: {
                    ch.controllerChange(MIDIControllers.releaseTime, data);
                    break;
                }

                case 0x23: {
                    // Bend pitch control (pitch wheel range)
                    const centeredValue = data - 64;
                    ch.pitchWheelRange(centeredValue);
                }
            }
            return;
        }

        if (a1 >> 4 === 3) {
            // Drum part setup
            if (this.masterParameters.drumLock) return;
            const drumKey = a2;
            switch (a3) {
                default: {
                    sysExNotRecognized([a3], "Yamaha XG Drum Setup");
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
                        coolInfo(
                            `Drum Pitch Fine, key ${drumKey}`,
                            ch.drumParams[drumKey].pitch
                        );
                    }
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
            a1 === 0x06 || // Display letters
            a1 === 0x07 // Display bitmap
        ) {
            // Displayed letters
            this.callEvent("synthDisplay", [...syx]);
        } else {
            sysExNotRecognized(syx, "Yamaha XG");
        }
    } else {
        sysExNotRecognized(syx, "Yamaha");
    }
}
