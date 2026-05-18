import { SpessaLog } from "../../../utils/loggin";
import { MIDIControllers } from "../../../midi/enums";
import type { SynthesizerCore } from "../synthesizer_core";
import type { SysExAcceptedArray } from "../../../midi/types";

/**
 * Handles a Yamaha XG system exclusive
 * http://www.studio4all.de/htmle/main91.html
 * @param syx
 * @param channelOffset
 */
export function yamahaSystemExclusive(
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
                        this.setMIDIParameter("fineTune", cents);
                        SpessaLog.xgInfo("Master Tune", cents, "cents");
                    }
                    break;
                }

                // Master volume
                case 0x04: {
                    this.setMIDIParameter("gain", data / 127);
                    SpessaLog.xgInfo("Master Volume", data);
                    break;
                }

                // Master attenuation
                case 0x05: {
                    const vol = 127 - data;
                    this.setMIDIParameter("gain", vol / 127);
                    SpessaLog.xgInfo("Master Attenuation", data);
                    break;
                }

                // Master transpose
                case 0x06: {
                    const transpose = data - 64;
                    this.setMIDIParameter("keyShift", transpose);
                    SpessaLog.xgInfo("Master Transpose", data);
                    break;
                }

                // XG Reset
                // XG on
                case 0x7f:
                case 0x7e: {
                    SpessaLog.coolInfo("MIDI System", "Yamaha XG");
                    this.reset("xg");
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

            SpessaLog.xgFail(`${effectType} parameter`, [effect]);
            return;
        }

        if (a1 === 0x08 /* A2 is the channel number*/) {
            const channel = a2 + channelOffset;
            if (channel >= this.midiChannels.length) {
                // Invalid channel
                SpessaLog.xgFail(
                    "Part Setup",
                    syx,
                    `Invalid part number: ${channel}`
                );
                return;
            }
            const ch = this.midiChannels[channel];
            switch (a3) {
                default: {
                    SpessaLog.xgFail("Part Setup", [syx[5]]);
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
                    SpessaLog.xgInfo(`Rev. Channel on ${channel}`, rxChannel);
                    break;
                }

                // Poly/mono
                case 0x05: {
                    const poly = data === 1;
                    ch.setMIDIParameter("polyMode", poly);
                    SpessaLog.xgInfo(
                        `Mono/poly on ${channel}`,
                        poly ? "POLY" : "MONO"
                    );
                    break;
                }

                // Part mode
                case 0x07: {
                    const drums = data !== 0;
                    ch.setDrums(drums);
                    SpessaLog.xgInfo(
                        `Part Mode on ${channel}`,
                        drums ? "DRUM" : "MELODIC"
                    );
                    break;
                }

                // Note shift
                case 0x08: {
                    const keyShift = data - 64;
                    ch.keyShift(keyShift);
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
                        SpessaLog.xgInfo(`Random Pan for ${channel}`, "ON");
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
            if (this.systemParameters.drumLock) return;
            const drumKey = a2;
            switch (a3) {
                default: {
                    SpessaLog.xgFail("Drum Setup", [a3]);
                    return;
                }

                case 0x00: {
                    // Drum pitch coarse
                    const pitch = (data - 64) * 100;
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].pitch = pitch;
                    }
                    SpessaLog.xgInfo(
                        `Drum Pitch for key ${drumKey}`,
                        pitch,
                        "semitones"
                    );
                    break;
                }

                case 0x01: {
                    // Drum pitch fine
                    const pitch = data - 64;
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].pitch += pitch;
                        SpessaLog.xgInfo(
                            `Drum Pitch for key ${drumKey}`,
                            ch.drumParams[drumKey].pitch,
                            "semitones"
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
                    SpessaLog.xgInfo(`Drum Level for key ${drumKey}`, data);
                    break;
                }

                case 0x03: {
                    // Drum Alternate Group (exclusive class)
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].exclusiveClass = data;
                    }
                    SpessaLog.xgInfo(
                        `Drum Alternate Group for key ${drumKey}`,
                        data
                    );
                    break;
                }

                case 0x04: {
                    // Drum Pan
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].pan = data;
                    }
                    SpessaLog.xgInfo(`Drum Pan for key ${drumKey}`, data);
                    break;
                }

                case 0x05: {
                    // Drum Reverb
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].reverbGain = data / 127;
                    }
                    SpessaLog.xgInfo(`Drum Reverb for key ${drumKey}`, data);
                    break;
                }

                case 0x06: {
                    // Drum Chorus
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].chorusGain = data / 127;
                    }
                    SpessaLog.xgInfo(`Drum Chorus for key ${drumKey}`, data);
                    break;
                }

                case 0x09: {
                    // Receive note off
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].rxNoteOff = data === 1;
                    }
                    SpessaLog.xgInfo(
                        `Drum Note Off for key ${drumKey}`,
                        data === 1 ? "ON" : "OFF"
                    );
                    break;
                }

                case 0x0a: {
                    // Receive note on
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].rxNoteOn = data === 1;
                    }
                    SpessaLog.xgInfo(
                        `Drum Note On for key ${drumKey}`,
                        data === 1 ? "ON" : "OFF"
                    );
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
            return;
        }

        SpessaLog.xgFail("System Exclusive", syx, "Unknown address");
    } else {
        SpessaLog.xgFail("System Exclusive", syx);
    }
}
