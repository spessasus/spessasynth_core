import { SpessaLog } from "../../../utils/loggin";
import { type MIDIController, MIDIControllers } from "../../../midi/enums";
import type { SynthesizerCore } from "../synthesizer_core";
import type { SysExAcceptedArray } from "../../../midi/types";
import { ModulatorControllerSources } from "../../../soundbank/enums";

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
                    this.setMIDIParameter("volume", data / 127);
                    SpessaLog.xgInfo("Master Volume", data);
                    break;
                }

                // Master attenuation
                case 0x05: {
                    const vol = 127 - data;
                    this.setMIDIParameter("volume", vol / 127);
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
            const ch = this.midiChannels[channel];
            if (!ch) {
                // Invalid channel
                SpessaLog.xgFail(
                    `Part Setup for ${channel}`,
                    syx,
                    `Invalid part number.`
                );
                return;
            }

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

                // Same note number key on assign
                case 0x06: {
                    ch.setMIDIParameter("assignMode", data);
                    SpessaLog.xgInfo(
                        `Same Note Number Key On Assign on ${channel}`,
                        data
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
                    ch.setMIDIParameter("keyShift", keyShift);
                    SpessaLog.xgInfo(`Key Shift on ${channel}`, keyShift);
                    break;
                }

                // Volume
                case 0x0b: {
                    ch.controllerChange(MIDIControllers.mainVolume, data);
                    break;
                }

                // Velocity Sense Depth
                case 0x0c: {
                    ch.setMIDIParameter("velocitySenseDepth", data);
                    SpessaLog.xgInfo(
                        `Velocity Sense Depth on ${channel}`,
                        data
                    );
                    return;
                }

                // Velocity Sense Offset
                case 0x0d: {
                    ch.setMIDIParameter("velocitySenseOffset", data);
                    SpessaLog.xgInfo(
                        `Velocity Sense Offset on ${channel}`,
                        data
                    );
                    return;
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

                // ---
                // XG Controller matrix starts here
                // ---
                // 2 Special cases which are aliases:

                // MW LFO PMOD Depth (alias to modulation wheel range)
                case 0x20: {
                    const centeredValue = data - 64;
                    ch.setMIDIParameter("modulationDepth", (data / 127) * 600);
                    SpessaLog.xgInfo(
                        `Modulation Wheel Range for ${channel}`,
                        centeredValue,
                        "cents"
                    );
                    break;
                }

                // Bend pitch control (alias to pitch wheel range)
                case 0x23: {
                    const centeredValue = data - 64;
                    ch.setMIDIParameter("pitchWheelRange", centeredValue);
                    SpessaLog.xgInfo(
                        `Pitch Wheel Range for ${channel}`,
                        centeredValue,
                        "semitones"
                    );
                    break;
                }

                // Auxiliary controllers
                // AC1 Controller number
                case 0x59: {
                    ch.setMIDIParameter("cc1", data as MIDIController);
                    SpessaLog.xgInfo(
                        `AC1 controller number for ${channel}`,
                        data
                    );
                    break;
                }

                // AC2 Controller number
                case 0x60: {
                    ch.setMIDIParameter("cc2", data as MIDIController);
                    SpessaLog.xgInfo(
                        `AC2 controller number for ${channel}`,
                        data
                    );
                    break;
                }

                // The receivers themselves:
                // Modulation Wheel
                case 0x1d:
                case 0x1e:
                case 0x1f:
                // 0x20 is aliased to modulation depth range
                case 0x21:
                case 0x22:

                // Pitch Bend
                // 0x23 is aliased to pitch bend range
                case 0x24:
                case 0x25:
                case 0x26:
                case 0x27:
                case 0x28:

                // Channel Aftertouch
                case 0x4d:
                case 0x4e:
                case 0x4f:
                case 0x50:
                case 0x51:
                case 0x52:

                // Poly Aftertouch
                case 0x53:
                case 0x54:
                case 0x55:
                case 0x56:
                case 0x57:
                case 0x58:

                // AC1
                // 0x59 is number, handled above
                case 0x5a:
                case 0x5b:
                case 0x5c:
                case 0x5d:
                case 0x5e:
                case 0x5f:

                // AC2
                // 0x60 is number, handled above
                case 0x61:
                case 0x62:
                case 0x63:
                case 0x64:
                case 0x65:
                case 0x66: {
                    let startAddr;
                    let source: number;
                    let isCC = false;
                    let sourceName;
                    let bipolar = false;

                    if (a3 <= 0x22) {
                        startAddr = 0x1d;
                        source = MIDIControllers.modulationWheel;
                        isCC = true;
                        sourceName = "mod wheel";
                    } else if (a3 <= 0x28) {
                        startAddr = 0x23;
                        source = ModulatorControllerSources.pitchWheel;
                        sourceName = "pitch wheel";
                        bipolar = true;
                    } else if (a3 <= 0x52) {
                        startAddr = 0x4d;
                        source = ModulatorControllerSources.channelPressure;
                        sourceName = "channel pressure";
                    } else if (a3 <= 0x58) {
                        startAddr = 0x53;
                        source = ModulatorControllerSources.polyPressure;
                        sourceName = "poly pressure";
                    } else if (a3 <= 0x5f) {
                        startAddr = 0x5a;
                        source = ch.midiParameters.cc1;
                        isCC = true;
                        sourceName = "AC1";
                    } else {
                        startAddr = 0x61;
                        source = ch.midiParameters.cc2;
                        isCC = true;
                        sourceName = "AC2";
                    }

                    // Map to GS
                    ch.dynamicModulators.setupReceiverXG(
                        a3 - startAddr,
                        data,
                        source,
                        isCC,
                        sourceName,
                        bipolar
                    );
                    break;
                }

                // ---
                // XG Controller Matrix ends here
                // ---

                // Portamento switch
                case 0x67: {
                    ch.controllerChange(
                        MIDIControllers.portamentoOnOff,
                        data === 1 ? 127 : 0
                    );
                    break;
                }

                // Portamento time
                case 0x68: {
                    ch.controllerChange(MIDIControllers.portamentoTime, data);
                    break;
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
                    const pitch = data - 64;
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].pitchCoarse = pitch;
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
                        ch.drumParams[drumKey].pitchFine = pitch;
                        SpessaLog.xgInfo(
                            `Drum Pitch Fine for key ${drumKey}`,
                            pitch,
                            "semitones"
                        );
                    }
                    break;
                }

                case 0x02: {
                    // Drum Level
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].level = data;
                    }
                    SpessaLog.xgInfo(`Drum Level for key ${drumKey}`, data);
                    break;
                }

                case 0x03: {
                    // Drum Alternate Group (exclusive class)
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].assignGroup = data;
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
                        ch.drumParams[drumKey].reverbSend = data;
                    }
                    SpessaLog.xgInfo(`Drum Reverb for key ${drumKey}`, data);
                    break;
                }

                case 0x06: {
                    // Drum Chorus
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].chorusSend = data;
                    }
                    SpessaLog.xgInfo(`Drum Chorus for key ${drumKey}`, data);
                    break;
                }

                case 0x07: {
                    // Drum Variation
                    for (const ch of this.midiChannels) {
                        if (!ch.drumChannel) continue;
                        ch.drumParams[drumKey].variationSend = data;
                    }
                    SpessaLog.xgInfo(`Drum Variation for key ${drumKey}`, data);
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
            this.callEvent("displayMessage", [...syx]);
            return;
        }

        SpessaLog.xgFail("System Exclusive", syx, "Unknown address");
    } else {
        SpessaLog.xgFail("System Exclusive", syx);
    }
}
