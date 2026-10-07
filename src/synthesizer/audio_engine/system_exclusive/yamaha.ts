import { SpessaLog } from "../../../utils/loggin";
import { type MIDIController, MIDIControllers } from "../../../midi/enums";
import { SpessaSynthProcessor } from "../../processor";
import type { SysExAcceptedArray } from "../../../midi/types";
import { ModulatorControllerSources } from "../../../soundbank/enums";
import {
    DEFAULT_XG_DRUM_MAP,
    MELODIC_MAP
} from "../../../midi/midi_tools/sysex_data";

/**
 * Handles a Yamaha XG system exclusive
 * http://www.studio4all.de/htmle/main91.html
 * @param syx
 * @param channelOffset
 */
export function yamahaSystemExclusive(
    this: SpessaSynthProcessor,
    syx: SysExAcceptedArray,
    channelOffset = 0
) {
    // XG sysex
    if (syx[2] === 0x4c) {
        const a1 = syx[3]; // Address 1
        const a2 = syx[4]; // Address 2
        const a3 = syx[5]; // Address 3
        // Data = syx[6]
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

        // XG EFFECT 1 (reverb, chorus, variation)
        if (a1 === 0x02 && a2 === 0x01) {
            const isReverb =
                a3 === 0x00 ||
                (a3 >= 0x02 && a3 <= 0x0d) ||
                (a3 >= 0x10 && a3 <= 0x15);
            if (isReverb && this.systemParameters.xgReverbLock) return;
            const isChorus =
                a3 === 0x20 ||
                (a3 >= 0x22 && a3 <= 0x2e) ||
                (a3 >= 0x30 && a3 <= 0x35);
            if (isChorus && this.systemParameters.xgChorusLock) return;
            const isVariation =
                a3 === 0x40 ||
                (a3 >= 0x42 && a3 <= 0x5b) ||
                (a3 >= 0x70 && a3 <= 0x75);
            if (isVariation && this.systemParameters.xgVariationLock) return;
            switch (a3) {
                default: {
                    SpessaLog.xgFail("EFFECT 1 Parameter", [a3]);
                    break;
                }

                case 0x00: {
                    const type = (data << 8) | syx[7];
                    this.xgReverbBlock.setType(type);
                    SpessaLog.xgInfo("Reverb Type", type.toString(16));
                    this.callEvent("effectChange", {
                        effect: "xgReverb",
                        parameter: "type",
                        value: type
                    });
                    return;
                }

                case 0x02:
                case 0x03:
                case 0x04:
                case 0x05:
                case 0x06:
                case 0x07:
                case 0x08:
                case 0x09:
                case 0x0a:
                case 0x0b: {
                    this.xgReverbBlock.setParameter(a3 - 0x02, data);
                    SpessaLog.xgInfo(`Reverb Parameter ${a3 - 0x01}`, data);
                    this.callEvent("effectChange", {
                        effect: "xgReverb",
                        parameter: a3 - 0x02,
                        value: data
                    });
                    return;
                }

                case 0x0c: {
                    this.xgReverbBlock.return = data;
                    SpessaLog.xgInfo(`Reverb Return`, data);
                    this.callEvent("effectChange", {
                        effect: "xgReverb",
                        parameter: "return",
                        value: data
                    });
                    return;
                }

                case 0x0d: {
                    this.xgReverbBlock.pan = data;
                    SpessaLog.xgInfo(`Reverb Pan`, data);
                    this.callEvent("effectChange", {
                        effect: "xgReverb",
                        parameter: "pan",
                        value: data
                    });
                    return;
                }

                case 0x10:
                case 0x11:
                case 0x12:
                case 0x13:
                case 0x14:
                case 0x15: {
                    this.xgReverbBlock.setParameter(a3 - 0x06, data);
                    SpessaLog.xgInfo(`Reverb Parameter ${a3 - 0x05}`, data);
                    this.callEvent("effectChange", {
                        effect: "xgReverb",
                        parameter: a3 - 0x06,
                        value: data
                    });
                    return;
                }

                case 0x20: {
                    const type = (data << 8) | syx[7];
                    this.xgChorusBlock.setType(type);
                    SpessaLog.xgInfo("Chorus Type", type.toString(16));
                    this.callEvent("effectChange", {
                        effect: "xgChorus",
                        parameter: "type",
                        value: type
                    });
                    return;
                }

                case 0x22:
                case 0x23:
                case 0x24:
                case 0x25:
                case 0x26:
                case 0x27:
                case 0x28:
                case 0x29:
                case 0x2a:
                case 0x2b: {
                    this.xgChorusBlock.setParameter(a3 - 0x22, data);
                    SpessaLog.xgInfo(`Chorus Parameter ${a3 - 0x21}`, data);
                    this.callEvent("effectChange", {
                        effect: "xgChorus",
                        parameter: a3 - 0x22,
                        value: data
                    });
                    return;
                }

                case 0x2c: {
                    this.xgChorusBlock.return = data;
                    SpessaLog.xgInfo(`Chorus Return`, data);
                    this.callEvent("effectChange", {
                        effect: "xgChorus",
                        parameter: "return",
                        value: data
                    });
                    return;
                }

                case 0x2d: {
                    this.xgChorusBlock.pan = data;
                    SpessaLog.xgInfo(`Chorus Pan`, data);
                    this.callEvent("effectChange", {
                        effect: "xgChorus",
                        parameter: "pan",
                        value: data
                    });
                    return;
                }

                case 0x2e: {
                    this.xgChorusBlock.sendToReverb = data;
                    SpessaLog.xgInfo(`Chorus Send To Reverb`, data);
                    this.callEvent("effectChange", {
                        effect: "xgChorus",
                        parameter: "sendToReverb",
                        value: data
                    });
                    return;
                }

                case 0x30:
                case 0x31:
                case 0x32:
                case 0x33:
                case 0x34:
                case 0x35: {
                    this.xgChorusBlock.setParameter(a3 - 0x26, data);
                    SpessaLog.xgInfo(`Chorus Parameter ${a3 - 0x25}`, data);
                    this.callEvent("effectChange", {
                        effect: "xgChorus",
                        parameter: a3 - 0x26,
                        value: data
                    });
                    return;
                }

                case 0x40: {
                    const type = (data << 8) | syx[7];
                    this.xgVariationBlock.setType(type);
                    SpessaLog.xgInfo("Variation Type", type.toString(16));
                    this.callEvent("effectChange", {
                        effect: "xgVariation",
                        parameter: "type",
                        value: type
                    });
                    return;
                }

                case 0x42:
                case 0x44:
                case 0x46:
                case 0x48:
                case 0x4a:
                case 0x4c:
                case 0x4e:
                case 0x50:
                case 0x52:
                case 0x54: {
                    // Params are 14-bit!
                    const value = (data << 7) | syx[7];
                    // Bit shift by 1 because address increases by two
                    this.xgVariationBlock.setParameter((a3 - 0x42) >> 1, value);
                    SpessaLog.xgInfo(
                        `Variation Parameter ${a3 - 0x41} (14-bit)`,
                        value.toString(16)
                    );
                    this.callEvent("effectChange", {
                        effect: "xgVariation",
                        parameter: (a3 - 0x42) >> 1,
                        value
                    });
                    return;
                }

                case 0x56: {
                    this.xgVariationBlock.return = data;
                    SpessaLog.xgInfo(`Variation Return`, data);
                    this.callEvent("effectChange", {
                        effect: "xgVariation",
                        parameter: "return",
                        value: data
                    });
                    return;
                }

                case 0x57: {
                    this.xgVariationBlock.pan = data;
                    SpessaLog.xgInfo(`Variation Pan`, data);
                    this.callEvent("effectChange", {
                        effect: "xgVariation",
                        parameter: "pan",
                        value: data
                    });
                    return;
                }

                case 0x58: {
                    this.xgVariationBlock.sendToReverb = data;
                    SpessaLog.xgInfo(`Variation Send To Reverb`, data);
                    this.callEvent("effectChange", {
                        effect: "xgVariation",
                        parameter: "sendToReverb",
                        value: data
                    });
                    return;
                }

                case 0x59: {
                    this.xgVariationBlock.sendToChorus = data;
                    SpessaLog.xgInfo(`Variation Send To Chorus`, data);
                    this.callEvent("effectChange", {
                        effect: "xgVariation",
                        parameter: "sendToChorus",
                        value: data
                    });
                    return;
                }

                case 0x5a: {
                    this.xgVariationBlock.insertionMode = data === 0;
                    SpessaLog.xgInfo(
                        "Variation Connection",
                        data === 0 ? "INSERTION" : "SYSTEM"
                    );
                    this.callEvent("effectChange", {
                        effect: "xgVariation",
                        parameter: "connection",
                        value: data === 0 ? "insertion" : "system"
                    });
                    return;
                }

                case 0x5b: {
                    this.xgVariationBlock.partNumber = data;
                    SpessaLog.xgInfo("Variation Part Number", data);
                    this.callEvent("effectChange", {
                        effect: "xgVariation",
                        parameter: "partNumber",
                        value: data
                    });
                    return;
                }

                case 0x70:
                case 0x71:
                case 0x72:
                case 0x73:
                case 0x74:
                case 0x75: {
                    // These are 7-bit only
                    this.xgVariationBlock.setParameter(a3 - 0x66, data);
                    SpessaLog.xgInfo(`Variation Parameter ${a3 - 0x65}`, data);
                    this.callEvent("effectChange", {
                        effect: "xgVariation",
                        parameter: a3 - 0x66,
                        value: data
                    });
                    return;
                }
            }
            return;
        }

        // XG EFFECT 2 (insertion)
        if (a1 === 0x03) {
            if (this.systemParameters.xgInsertionLock) return;
            const insertion = this.xgInsertionBlocks[a2];
            if (!insertion) {
                SpessaLog.xgFail("Insertion Effect Number", [a2]);
                return;
            }

            switch (a3) {
                default: {
                    SpessaLog.xgFail("EFFECT 2 Parameter", [a3]);
                    break;
                }

                case 0x00: {
                    const type = (data << 8) | syx[7];
                    insertion.setType(type);
                    SpessaLog.xgInfo(`Insertion ${a2} Type`, type.toString(16));
                    this.callEvent("effectChange", {
                        effect: "xgInsertion",
                        insertionNumber: a2,
                        parameter: "type",
                        value: type
                    });
                    return;
                }

                case 0x02:
                case 0x03:
                case 0x04:
                case 0x05:
                case 0x06:
                case 0x07:
                case 0x08:
                case 0x09:
                case 0x0a:
                case 0x0b: {
                    insertion.setParameter(a3 - 0x02, data);
                    SpessaLog.xgInfo(
                        `Insertion ${a2} Parameter ${a3 - 0x01}`,
                        data
                    );
                    this.callEvent("effectChange", {
                        effect: "xgInsertion",
                        insertionNumber: a2,
                        parameter: a3 - 0x02,
                        value: data
                    });
                    return;
                }

                case 0x0c: {
                    insertion.partNumber = data;
                    SpessaLog.xgInfo(`Insertion ${a2} Part Number`, data);
                    this.callEvent("effectChange", {
                        effect: "xgInsertion",
                        insertionNumber: a2,
                        parameter: "partNumber",
                        value: data
                    });
                    return;
                }

                case 0x20:
                case 0x21:
                case 0x22:
                case 0x23:
                case 0x24:
                case 0x25: {
                    insertion.setParameter(a3 - 0x16, data);
                    SpessaLog.xgInfo(
                        `Insertion ${a2} Parameter ${a3 - 0x15}`,
                        data
                    );
                    this.callEvent("effectChange", {
                        effect: "xgInsertion",
                        insertionNumber: a2,
                        parameter: a3 - 0x16,
                        value: data
                    });
                    return;
                }

                case 0x30:
                case 0x32:
                case 0x34:
                case 0x36:
                case 0x38:
                case 0x3a:
                case 0x3c:
                case 0x3e:
                case 0x40:
                case 0x42: {
                    const value = (data << 7) | syx[7];
                    // Bit shift by 1 because address increases by two
                    insertion.setParameter((a3 - 0x30) >> 1, value);
                    SpessaLog.xgInfo(
                        `Insertion ${a2} Parameter ${a3 - 0x2f} (14-bit)`,
                        value
                    );
                    this.callEvent("effectChange", {
                        effect: "xgInsertion",
                        insertionNumber: a2,
                        parameter: (a3 - 0x30) >> 1,
                        value
                    });
                    return;
                }
            }
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
                    const drums = data !== MELODIC_MAP;
                    // Testcase: xg part_mode_drum
                    // Verified with s-yxg50
                    // SetDrums switches the bank and keeps the program,
                    // But switching *to* drums re-initializes the kit
                    // To program 0 instead!
                    // But not if it's already drum
                    // Testcase: 15. U.N. Owen was her (yoimutu).mid
                    const drumsBefore = ch.drumChannel;
                    ch.setDrums(drums);
                    if (drums && !drumsBefore) {
                        ch.programChange(0);
                    }
                    ch.setMIDIParameter("drumMap", data);
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
                    break;
                }

                // Velocity Sense Offset
                case 0x0d: {
                    ch.setMIDIParameter("velocitySenseOffset", data);
                    SpessaLog.xgInfo(
                        `Velocity Sense Offset on ${channel}`,
                        data
                    );
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

                // Dry level
                case 0x11: {
                    ch.setMIDIParameter("dryLevel", data);
                    SpessaLog.xgInfo(`Dry Level on ${channel}`, data);
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

            // In xg, the map is offset by the default (e.g. 2)
            // So 0 means drum setup 2, 1 means drum setup 3, etc.
            const setupNumber = (a1 & 0xf) + DEFAULT_XG_DRUM_MAP;
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
                        if (ch.midiParameters.drumMap !== setupNumber) continue;
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
                        if (ch.midiParameters.drumMap !== setupNumber) continue;
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
                        if (ch.midiParameters.drumMap !== setupNumber) continue;
                        ch.drumParams[drumKey].level = data;
                    }
                    SpessaLog.xgInfo(`Drum Level for key ${drumKey}`, data);
                    break;
                }

                case 0x03: {
                    // Drum Alternate Group (exclusive class)
                    for (const ch of this.midiChannels) {
                        if (ch.midiParameters.drumMap !== setupNumber) continue;
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
                        if (ch.midiParameters.drumMap !== setupNumber) continue;
                        ch.drumParams[drumKey].pan = data;
                    }
                    SpessaLog.xgInfo(`Drum Pan for key ${drumKey}`, data);
                    break;
                }

                case 0x05: {
                    // Drum Reverb
                    for (const ch of this.midiChannels) {
                        if (ch.midiParameters.drumMap !== setupNumber) continue;
                        ch.drumParams[drumKey].reverbSend = data;
                    }
                    SpessaLog.xgInfo(`Drum Reverb for key ${drumKey}`, data);
                    break;
                }

                case 0x06: {
                    // Drum Chorus
                    for (const ch of this.midiChannels) {
                        if (ch.midiParameters.drumMap !== setupNumber) continue;
                        ch.drumParams[drumKey].chorusSend = data;
                    }
                    SpessaLog.xgInfo(`Drum Chorus for key ${drumKey}`, data);
                    break;
                }

                case 0x07: {
                    // Drum Variation
                    for (const ch of this.midiChannels) {
                        if (ch.midiParameters.drumMap !== setupNumber) continue;
                        ch.drumParams[drumKey].variationSend = data;
                    }
                    SpessaLog.xgInfo(`Drum Variation for key ${drumKey}`, data);
                    break;
                }

                case 0x09: {
                    // Receive note off
                    for (const ch of this.midiChannels) {
                        if (ch.midiParameters.drumMap !== setupNumber) continue;
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
                        if (ch.midiParameters.drumMap !== setupNumber) continue;
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
