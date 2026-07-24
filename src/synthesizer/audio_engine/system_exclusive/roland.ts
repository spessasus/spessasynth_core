import { SpessaLog } from "../../../utils/loggin";
import { type MIDIController, MIDIControllers } from "../../../midi/enums";
import { ModulatorControllerSources } from "../../../soundbank/enums";
import { readBinaryString } from "../../../utils/byte_functions/string";
import type { SynthesizerCore } from "../synthesizer_core";
import { MIDIUtils } from "../../../midi/midi_tools/midi_utils";
import { EFX_SENDS_GAIN_CORRECTION } from "../synth_constants";
import type { SysExAcceptedArray } from "../../../midi/types";

/**
 * Handles a Roland GS system exclusive
 * http://www.bandtrax.com.au/sysex.htm
 * https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf
 * @param syx
 * @param channelOffset
 */
export function rolandSystemExclusive(
    this: SynthesizerCore,
    syx: SysExAcceptedArray,
    channelOffset = 0
) {
    // 0x12: DT1 (Device Transmit)
    if (syx[3] === 0x12) {
        // Model ID
        switch (syx[2]) {
            // GS
            case 0x42: {
                // This is a GS sysex
                const a1 = syx[4];
                const a2 = syx[5];
                const a3 = syx[6];

                // Sanity check
                const data = Math.min(syx[7], 127);
                // SYSTEM MODE SET
                if (
                    a1 === 0 &&
                    a2 === 0 &&
                    a3 === 0x7f &&
                    (data === 0x00 || data === 0x01)
                ) {
                    if (data === 0x01) {
                        // Double module mode, ensure at least 32 channels
                        SpessaLog.gsInfo("Mode", "Double Module");
                        while (this.midiChannels.length < 32) {
                            this.createMIDIChannel(true);
                        }
                    }
                    // This is a GS reset
                    SpessaLog.coolInfo("MIDI System", "Roland GS");
                    this.reset("gs");
                    return;
                }

                // Patch Parameter
                if (a1 === 0x40 || a1 === 0x50) {
                    // 50 means BLOCK B (+16 channels)
                    // Testcase: 95043-2.KYC.mid
                    if (a1 === 0x50) {
                        channelOffset += 16;
                    }
                    // System Parameter
                    if (a2 === 0x00) {
                        switch (a3) {
                            case 0x00: {
                                // Roland GS master tune
                                const tune =
                                    (data << 12) |
                                    (syx[8] << 8) |
                                    (syx[9] << 4) |
                                    syx[10];
                                const cents = (tune - 1024) / 10;
                                this.setMIDIParameter("fineTune", cents);
                                SpessaLog.gsInfo("Master Tune", cents, "cents");
                                break;
                            }

                            case 0x04: {
                                // Roland GS master volume
                                SpessaLog.gsInfo("Master Volume", data);
                                this.setMIDIParameter("volume", data / 127);
                                break;
                            }

                            case 0x05: {
                                // Roland master key shift
                                const transpose = data - 64;
                                SpessaLog.gsInfo(
                                    "Master Key-Shift",
                                    transpose,
                                    "keys"
                                );
                                this.setMIDIParameter("keyShift", transpose);
                                break;
                            }

                            case 0x06: {
                                // Roland master pan
                                // 63, it ranges from 1 to 127, NOT 0 to 127!
                                const pan = (data - 64) / 63;

                                SpessaLog.gsInfo("Master Pan", pan);
                                this.setMIDIParameter("pan", pan);
                                break;
                            }

                            case 0x7f: {
                                // Roland mode set
                                // GS mode set
                                if (data === 0x00) {
                                    // This is a GS reset
                                    SpessaLog.coolInfo(
                                        "MIDI System",
                                        "Roland GS"
                                    );
                                    this.reset("gs");
                                } else if (data === 0x7f) {
                                    // GS mode off
                                    SpessaLog.coolInfo(
                                        "MIDI System",
                                        "General MIDI 1"
                                    );
                                    this.reset("gm");
                                }
                                break;
                            }

                            default: {
                                SpessaLog.gsFail("System Parameter", syx);
                                break;
                            }
                        }
                        return;
                    }

                    // Part Parameter, Patch Common (Effects)
                    if (a2 === 0x01) {
                        const isReverb = a3 >= 0x30 && a3 <= 0x37;
                        const isChorus = a3 >= 0x38 && a3 <= 0x40;
                        const isDelay = a3 >= 0x50 && a3 <= 0x5a;
                        // Disable effect editing if locked
                        if (isReverb && this.systemParameters.reverbLock)
                            return;
                        if (isChorus && this.systemParameters.chorusLock)
                            return;
                        if (isDelay && this.systemParameters.delayLock) return;
                        /*
                            0x40 - chorus to delay
                            enable delay that way
                             */
                        this.delayActive ||= a3 === 0x40 || isDelay;

                        switch (a3) {
                            default: {
                                SpessaLog.gsFail("Patch Common Parameter", [
                                    a3
                                ]);
                                break;
                            }

                            case 0x00: {
                                // Patch name
                                const patchName = readBinaryString(syx, 16, 7);
                                SpessaLog.gsInfo("Patch name", patchName);
                                this.callEvent("displayMessage", [...syx]);
                                break;
                            }
                            // Reverb
                            case 0x30: {
                                // Reverb macro
                                this.setReverbMacro(data);
                                SpessaLog.gsInfo("Reverb Macro", data);
                                // Event called in setMacro
                                break;
                            }
                            case 0x31: {
                                // Reverb character
                                this.reverbProcessor.character = data;
                                SpessaLog.gsInfo("Reverb Character", data);
                                this.callEvent("effectChange", {
                                    effect: "reverb",
                                    parameter: "character",
                                    value: data
                                });
                                break;
                            }
                            case 0x32: {
                                // Reverb pre-PLF
                                this.reverbProcessor.preLowpass = data;
                                SpessaLog.gsInfo("Reverb Pre-LPF", data);
                                this.callEvent("effectChange", {
                                    effect: "reverb",
                                    parameter: "preLowpass",
                                    value: data
                                });
                                break;
                            }
                            case 0x33: {
                                // Reverb level
                                this.reverbProcessor.level = data;
                                SpessaLog.gsInfo("Reverb Level", data);
                                this.callEvent("effectChange", {
                                    effect: "reverb",
                                    parameter: "level",
                                    value: data
                                });
                                break;
                            }
                            case 0x34: {
                                // Reverb time
                                this.reverbProcessor.time = data;
                                SpessaLog.gsInfo("Reverb Time", data);
                                this.callEvent("effectChange", {
                                    effect: "reverb",
                                    parameter: "time",
                                    value: data
                                });
                                break;
                            }
                            case 0x35: {
                                // Reverb delay feedback
                                this.reverbProcessor.delayFeedback = data;
                                SpessaLog.gsInfo("Reverb Delay Feedback", data);
                                this.callEvent("effectChange", {
                                    effect: "reverb",
                                    parameter: "delayFeedback",
                                    value: data
                                });
                                break;
                            }

                            case 0x36: {
                                // Reverb send to chorus, legacy SC-55 that's recognized by later models and unsupported.
                                break;
                            }

                            case 0x37: {
                                // Reverb predelay time
                                this.reverbProcessor.preDelayTime = data;
                                SpessaLog.gsInfo("Reverb Predelay Time", data);
                                this.callEvent("effectChange", {
                                    effect: "reverb",
                                    parameter: "preDelayTime",
                                    value: data
                                });
                                break;
                            }

                            // Chorus
                            case 0x38: {
                                // Chorus macro
                                this.setChorusMacro(data);
                                SpessaLog.gsInfo("Chorus Macro", data);
                                // Event called in setMacro
                                break;
                            }
                            case 0x39: {
                                // Chorus pre-LPF
                                this.chorusProcessor.preLowpass = data;
                                SpessaLog.gsInfo("Chorus Pre-LPF", data);
                                this.callEvent("effectChange", {
                                    effect: "chorus",
                                    parameter: "preLowpass",
                                    value: data
                                });
                                break;
                            }
                            case 0x3a: {
                                // Chorus level
                                this.chorusProcessor.level = data;
                                SpessaLog.gsInfo("Chorus Level", data);
                                this.callEvent("effectChange", {
                                    effect: "chorus",
                                    parameter: "level",
                                    value: data
                                });
                                break;
                            }
                            case 0x3b: {
                                // Chorus feedback
                                this.chorusProcessor.feedback = data;
                                SpessaLog.gsInfo("Chorus Feedback", data);
                                this.callEvent("effectChange", {
                                    effect: "chorus",
                                    parameter: "feedback",
                                    value: data
                                });
                                break;
                            }
                            case 0x3c: {
                                // Chorus delay
                                this.chorusProcessor.delay = data;
                                SpessaLog.gsInfo("Chorus Delay", data);
                                this.callEvent("effectChange", {
                                    effect: "chorus",
                                    parameter: "delay",
                                    value: data
                                });
                                break;
                            }
                            case 0x3d: {
                                // Chorus rate
                                this.chorusProcessor.rate = data;
                                SpessaLog.gsInfo("Chorus Rate", data);
                                this.callEvent("effectChange", {
                                    effect: "chorus",
                                    parameter: "rate",
                                    value: data
                                });
                                break;
                            }
                            case 0x3e: {
                                // Chorus depth
                                this.chorusProcessor.depth = data;
                                SpessaLog.gsInfo("Chorus Depth", data);
                                this.callEvent("effectChange", {
                                    effect: "chorus",
                                    parameter: "depth",
                                    value: data
                                });
                                break;
                            }
                            case 0x3f: {
                                // Chorus send level to reverb
                                this.chorusProcessor.sendLevelToReverb = data;
                                SpessaLog.gsInfo(
                                    "Chorus Send Level To Reverb",
                                    data
                                );
                                this.callEvent("effectChange", {
                                    effect: "chorus",
                                    parameter: "sendLevelToReverb",
                                    value: data
                                });
                                break;
                            }
                            case 0x40: {
                                // Chorus send level to delay
                                this.chorusProcessor.sendLevelToDelay = data;
                                SpessaLog.gsInfo(
                                    "Chorus Send Level To Delay",
                                    data
                                );
                                this.callEvent("effectChange", {
                                    effect: "chorus",
                                    parameter: "sendLevelToDelay",
                                    value: data
                                });
                                break;
                            }

                            // Delay
                            case 0x50: {
                                // Delay macro
                                this.setDelayMacro(data);
                                SpessaLog.gsInfo("Delay Macro", data);
                                // Event called in setMacro
                                break;
                            }
                            case 0x51: {
                                // Delay pre-PLF
                                this.delayProcessor.preLowpass = data;
                                SpessaLog.gsInfo("Delay Pre-LPF", data);
                                this.callEvent("effectChange", {
                                    effect: "delay",
                                    parameter: "preLowpass",
                                    value: data
                                });
                                break;
                            }
                            case 0x52: {
                                // Delay time center
                                this.delayProcessor.timeCenter = data;
                                SpessaLog.gsInfo("Delay Time Center", data);
                                this.callEvent("effectChange", {
                                    effect: "delay",
                                    parameter: "timeCenter",
                                    value: data
                                });
                                break;
                            }
                            case 0x53: {
                                // Delay time ratio left
                                this.delayProcessor.timeRatioLeft = data;
                                SpessaLog.gsInfo("Delay Time Ratio Left", data);
                                this.callEvent("effectChange", {
                                    effect: "delay",
                                    parameter: "timeRatioLeft",
                                    value: data
                                });
                                break;
                            }
                            case 0x54: {
                                // Delay time ratio right
                                this.delayProcessor.timeRatioRight = data;
                                SpessaLog.gsInfo(
                                    "Delay Time Ratio Right",
                                    data
                                );
                                this.callEvent("effectChange", {
                                    effect: "delay",
                                    parameter: "timeRatioRight",
                                    value: data
                                });
                                break;
                            }
                            case 0x55: {
                                // Delay level center
                                this.delayProcessor.levelCenter = data;
                                SpessaLog.gsInfo("Delay Level Center", data);
                                this.callEvent("effectChange", {
                                    effect: "delay",
                                    parameter: "levelCenter",
                                    value: data
                                });
                                break;
                            }
                            case 0x56: {
                                // Delay level left
                                this.delayProcessor.levelLeft = data;
                                SpessaLog.gsInfo("Delay Level Left", data);
                                this.callEvent("effectChange", {
                                    effect: "delay",
                                    parameter: "levelLeft",
                                    value: data
                                });
                                break;
                            }
                            case 0x57: {
                                // Delay level right
                                this.delayProcessor.levelRight = data;
                                SpessaLog.gsInfo("Delay Level Right", data);
                                this.callEvent("effectChange", {
                                    effect: "delay",
                                    parameter: "levelRight",
                                    value: data
                                });
                                break;
                            }
                            case 0x58: {
                                // Delay level
                                this.delayProcessor.level = data;
                                SpessaLog.gsInfo("Delay Level", data);
                                this.callEvent("effectChange", {
                                    effect: "delay",
                                    parameter: "level",
                                    value: data
                                });
                                break;
                            }
                            case 0x59: {
                                // Delay feedback
                                this.delayProcessor.feedback = data;
                                SpessaLog.gsInfo("Delay Feedback", data);
                                this.callEvent("effectChange", {
                                    effect: "delay",
                                    parameter: "feedback",
                                    value: data
                                });
                                break;
                            }
                            case 0x5a: {
                                // Delay send level to reverb
                                this.delayProcessor.sendLevelToReverb = data;
                                SpessaLog.gsInfo(
                                    "Delay Send Level To Reverb",
                                    data
                                );
                                this.callEvent("effectChange", {
                                    effect: "delay",
                                    parameter: "sendLevelToReverb",
                                    value: data
                                });
                                break;
                            }
                        }
                        break;
                    }

                    // EFX Parameter
                    if (a2 === 0x03) {
                        if (this.systemParameters.insertionEffectLock) return;

                        // Write parameters
                        if (a3 >= 0x03 && a3 <= 0x19)
                            this.insertionParams[a3 - 3] = data;

                        if (a3 >= 0x03 && a3 <= 0x16) {
                            this.insertionProcessor.setParameter(a3, data);
                            SpessaLog.gsInfo(`EFX Parameter ${a3 - 2}`, data);
                            this.callEvent("effectChange", {
                                effect: "insertion",
                                parameter: a3,
                                value: data
                            });
                            return;
                        }
                        switch (a3) {
                            default: {
                                SpessaLog.gsFail("Insertion Effect", [a3]);
                                return;
                            }

                            case 0x00: {
                                // EFX Type
                                const type = (data << 8) | syx[8];
                                const proc = this.insertionEffects.get(type);
                                if (proc) {
                                    SpessaLog.gsInfo(
                                        "EFX Type",
                                        type.toString(16)
                                    );
                                    this.insertionProcessor = proc;
                                } else {
                                    this.insertionProcessor =
                                        this.insertionFallback;
                                    SpessaLog.gsFail(
                                        "EFX Processor",
                                        [type],
                                        "Using Thru."
                                    );
                                }
                                this.resetInsertionParams();
                                this.insertionProcessor.reset();
                                // Special case: 16-bit value
                                this.callEvent("effectChange", {
                                    effect: "insertion",
                                    parameter: 0,
                                    value: type
                                });
                                return;
                            }

                            case 0x17: {
                                // To reverb
                                // Divide, insertions use 0-1
                                this.insertionProcessor.sendLevelToReverb =
                                    (data / 127) * EFX_SENDS_GAIN_CORRECTION;
                                SpessaLog.gsInfo(
                                    "EFX Send Level to Reverb",
                                    data
                                );
                                this.callEvent("effectChange", {
                                    effect: "insertion",
                                    parameter: a3,
                                    value: data
                                });
                                return;
                            }

                            case 0x18: {
                                // To chorus
                                // Divide, insertions use 0-1
                                this.insertionProcessor.sendLevelToChorus =
                                    (data / 127) * EFX_SENDS_GAIN_CORRECTION;
                                SpessaLog.gsInfo(
                                    "EFX Send Level to Chorus",
                                    data
                                );
                                this.callEvent("effectChange", {
                                    effect: "insertion",
                                    parameter: a3,
                                    value: data
                                });
                                return;
                            }

                            case 0x19: {
                                // To delay
                                // Divide, insertions use 0-1
                                this.insertionProcessor.sendLevelToDelay =
                                    (data / 127) * EFX_SENDS_GAIN_CORRECTION;
                                this.delayActive = true;
                                SpessaLog.gsInfo(
                                    "EFX Send Level to Delay",
                                    data
                                );
                                this.callEvent("effectChange", {
                                    effect: "insertion",
                                    parameter: a3,
                                    value: data
                                });
                                return;
                            }
                        }
                    }

                    // Patch Parameters
                    if (a2 >> 4 === 1) {
                        // This is an individual part (channel) parameter
                        // Determine the channel
                        // Note that: 0 means channel 9 (drums), and only then 1 means channel 0, 2 channel 1, etc.
                        // SC-8850 manual, page 237
                        const channel =
                            MIDIUtils.syxToChannel(a2 & 0x0f) + channelOffset;
                        // For example, 0x1A means A = 11, which corresponds to channel 12 (counting from 1)
                        const ch = this.midiChannels[channel];
                        if (!ch) {
                            SpessaLog.gsFail(
                                `Patch Parameter for ${channel}`,
                                syx,
                                "Invalid channel number"
                            );
                        }
                        switch (a3) {
                            default: {
                                // This is some other GS sysex...
                                SpessaLog.gsFail(
                                    `Patch Part Parameter for ${channel}`,
                                    [a3]
                                );
                                return;
                            }

                            case 0x00: {
                                // Tone number (program change)
                                ch.controllerChange(
                                    MIDIControllers.bankSelect,
                                    data
                                );
                                ch.programChange(syx[8]);
                                break;
                            }

                            case 0x02: {
                                // Rx. channel (0x10 is OFF)
                                const rxChannel =
                                    data === 0x10 ? -1 : data + channelOffset;
                                ch.setMIDIParameter("rxChannel", rxChannel);
                                this.customChannelNumbers ||=
                                    rxChannel !== ch.channel;
                                SpessaLog.gsInfo(
                                    `Rx. Channel on ${channel}`,
                                    rxChannel
                                );
                                break;
                            }

                            case 0x13: {
                                // Mono/poly
                                ch.setMIDIParameter("polyMode", data === 1);
                                SpessaLog.gsInfo(
                                    `Mono/poly on ${channel}`,
                                    ch.midiParameters.polyMode ? "POLY" : "MONO"
                                );
                                break;
                            }

                            case 0x14: {
                                ch.setMIDIParameter("assignMode", data);
                                SpessaLog.gsInfo(
                                    `Assign mode on ${channel}`,
                                    data
                                );
                                break;
                            }

                            case 0x15: {
                                // This is the Use for Drum Part sysex (multiple drums)
                                ch.setMIDIParameter("drumMap", data);
                                const isDrums = data > 0; // If set to other than 0, is a drum channel
                                ch.setGSDrums(isDrums);
                                SpessaLog.gsInfo(
                                    `Drums on ${channel}`,
                                    isDrums.toString()
                                );
                                return;
                            }

                            case 0x16: {
                                // This is the pitch key shift sysex
                                const keyShift = data - 64;
                                ch.setMIDIParameter("keyShift", keyShift);
                                SpessaLog.gsInfo(
                                    `Key Shift for ${channel}`,
                                    keyShift
                                );
                                return;
                            }

                            // Pitch offset fine in Hz is not supported so far

                            case 0x19: {
                                // Part level (cc#7)
                                ch.controllerChange(
                                    MIDIControllers.mainVolume,
                                    data
                                );
                                return;
                            }

                            case 0x1a: {
                                // Velocity Sense Depth
                                ch.setMIDIParameter("velocitySenseDepth", data);
                                SpessaLog.gsInfo(
                                    `Velocity Sense Depth for ${channel}`,
                                    data
                                );
                                return;
                            }

                            case 0x1b: {
                                // Velocity Sense Offset
                                ch.setMIDIParameter(
                                    "velocitySenseOffset",
                                    data
                                );
                                SpessaLog.gsInfo(
                                    `Velocity Sense Offset for ${channel}`,
                                    data
                                );
                                return;
                            }

                            // Pan position
                            case 0x1c: {
                                // 0 is random
                                const panPosition = data;
                                const randomPan = panPosition === 0;
                                ch.setMIDIParameter("randomPan", randomPan);
                                if (randomPan)
                                    SpessaLog.gsInfo(
                                        `Random pan on ${channel}`,
                                        "ON"
                                    );
                                else
                                    ch.controllerChange(
                                        MIDIControllers.pan,
                                        panPosition
                                    );

                                break;
                            }

                            case 0x1f: {
                                // CC1 controller number
                                ch.setMIDIParameter(
                                    "cc1",
                                    data as MIDIController
                                );
                                SpessaLog.gsInfo(
                                    `CC1 Controller Number for ${channel}`,
                                    data
                                );
                                break;
                            }

                            case 0x20: {
                                // CC2 controller number
                                ch.setMIDIParameter(
                                    "cc2",
                                    data as MIDIController
                                );
                                SpessaLog.gsInfo(
                                    `CC2 Controller Number for ${channel}`,
                                    data
                                );
                                break;
                            }

                            // Chorus send
                            case 0x21: {
                                ch.controllerChange(
                                    MIDIControllers.chorusDepth,
                                    data
                                );
                                break;
                            }

                            // Reverb send
                            case 0x22: {
                                ch.controllerChange(
                                    MIDIControllers.reverbDepth,
                                    data
                                );
                                break;
                            }

                            case 0x2a: {
                                // Fine tune
                                // 0-16384
                                const tune = (data << 7) | syx[8];
                                const cents = (tune - 8192) / 81.92;
                                ch.setMIDIParameter("fineTune", cents);
                                SpessaLog.gsInfo(
                                    `Fine tuning for ${channel}`,
                                    Math.round(cents),
                                    "cents"
                                );
                                break;
                            }

                            // Delay send
                            case 0x2c: {
                                ch.controllerChange(
                                    MIDIControllers.variationDepth,
                                    data
                                );
                                break;
                            }

                            case 0x30: {
                                // Vibrato rate
                                ch.controllerChange(
                                    MIDIControllers.vibratoRate,
                                    data
                                );
                                break;
                            }

                            case 0x31: {
                                // Vibrato depth
                                ch.controllerChange(
                                    MIDIControllers.vibratoDepth,
                                    data
                                );
                                break;
                            }

                            case 0x32: {
                                // Filter cutoff
                                // It's so out of order, Roland...
                                ch.controllerChange(
                                    MIDIControllers.brightness,
                                    data
                                );
                                break;
                            }

                            case 0x33: {
                                // Filter resonance
                                ch.controllerChange(
                                    MIDIControllers.filterResonance,
                                    data
                                );
                                break;
                            }

                            case 0x34: {
                                // Attack time
                                ch.controllerChange(
                                    MIDIControllers.attackTime,
                                    data
                                );
                                break;
                            }

                            case 0x35: {
                                // Decay time
                                ch.controllerChange(
                                    MIDIControllers.decayTime,
                                    data
                                );
                                break;
                            }

                            case 0x36: {
                                // Release time
                                ch.controllerChange(
                                    MIDIControllers.releaseTime,
                                    data
                                );
                                break;
                            }

                            case 0x37: {
                                // Vibrato delay
                                // It seems that they forgot about it and put it last...
                                ch.controllerChange(
                                    MIDIControllers.vibratoDelay,
                                    data
                                );
                                break;
                            }

                            case 0x40: {
                                // Scale tuning: up to 12 bytes
                                const tuningBytes = syx.length - 9; // Data starts at 7, minus checksum and f7
                                // Read em bytes
                                const newTuning = new Int8Array(12);
                                for (let i = 0; i < tuningBytes; i++) {
                                    newTuning[i] = syx[i + 7] - 64;
                                }
                                ch.setOctaveTuning(newTuning);
                                SpessaLog.gsInfo(
                                    `Octave Scale Tuning for ${channel}`,
                                    newTuning.join(", ")
                                );
                                break;
                            }
                        }
                        return;
                    }

                    // Patch Parameter controllers
                    if (a2 >> 4 === 2) {
                        // This is an individual part (channel) parameter
                        // Determine the channel
                        // Note that: 0 means channel 9 (drums), and only then 1 means channel 0, 2 channel 1, etc.
                        // SC-8850 manual, page 237
                        const channel =
                            MIDIUtils.syxToChannel(a2 & 0x0f) + channelOffset;
                        // For example, 0x1A means A = 11, which corresponds to channel 12 (counting from 1)
                        const ch = this.midiChannels[channel];
                        switch (a3 & 0xf0) {
                            default: {
                                // This is some other GS sysex...
                                SpessaLog.gsFail(
                                    `Patch Parameter Controller for ${channel}`,
                                    [a3 & 0xf0]
                                );
                                break;
                            }

                            case 0x00: {
                                // Modulation wheel
                                if ((a3 & 0x0f) === 0x04) {
                                    // LFO1 Pitch depth
                                    // Special case:
                                    // If the source is a mod wheel, it's a strange way of setting the modulation depth
                                    // Testcase: J-Cycle.mid (it affects gm.dls which uses LFO1 for modulation)
                                    const cents = (data / 127) * 600;
                                    ch.setMIDIParameter(
                                        "modulationDepth",
                                        cents
                                    );
                                    SpessaLog.gsInfo(
                                        `Modulation depth for ${channel}`,
                                        Math.round(cents),
                                        "cents"
                                    );
                                    break;
                                }
                                ch.dynamicModulators.setupReceiver(
                                    a3,
                                    data,
                                    MIDIControllers.modulationWheel,
                                    true,
                                    "mod wheel"
                                );
                                break;
                            }

                            case 0x10: {
                                // Pitch wheel
                                if ((a3 & 0x0f) === 0x00) {
                                    // See https://github.com/spessasus/SpessaSynth/issues/154
                                    // Pitch control
                                    // Special case:
                                    // If the source is a pitch wheel, it's a strange way of setting the pitch wheel range
                                    // Testcase: th07_03.mid
                                    const centeredValue = data - 64;
                                    ch.setMIDIParameter(
                                        "pitchWheelRange",
                                        centeredValue
                                    );
                                    SpessaLog.gsInfo(
                                        `Pitch Wheel Range for ${channel}`,
                                        centeredValue,
                                        "semitones"
                                    );
                                    break;
                                }
                                ch.dynamicModulators.setupReceiver(
                                    a3,
                                    data,
                                    ModulatorControllerSources.pitchWheel,
                                    false,
                                    "pitch wheel",
                                    true
                                );
                                break;
                            }

                            case 0x20: {
                                // Channel pressure
                                ch.dynamicModulators.setupReceiver(
                                    a3,
                                    data,
                                    ModulatorControllerSources.channelPressure,
                                    false,
                                    "channel pressure"
                                );
                                break;
                            }

                            case 0x30: {
                                // Poly pressure
                                ch.dynamicModulators.setupReceiver(
                                    a3,
                                    data,
                                    ModulatorControllerSources.polyPressure,
                                    false,
                                    "poly pressure"
                                );
                                break;
                            }

                            case 0x40: {
                                // CC1
                                ch.dynamicModulators.setupReceiver(
                                    a3,
                                    data,
                                    ch.midiParameters.cc1,
                                    true,
                                    "CC1"
                                );
                                break;
                            }

                            case 0x50: {
                                // CC2
                                ch.dynamicModulators.setupReceiver(
                                    a3,
                                    data,
                                    ch.midiParameters.cc2,
                                    true,
                                    "CC2"
                                );
                            }
                        }
                        return;
                    }

                    // Patch Parameter Tone Map
                    if (a2 >> 4 === 4) {
                        // This is an individual part (channel) parameter
                        // Determine the channel
                        // Note that: 0 means channel 9 (drums), and only then 1 means channel 0, 2 channel 1, etc.
                        // SC-8850 manual, page 237
                        const channel =
                            MIDIUtils.syxToChannel(a2 & 0x0f) + channelOffset;
                        // For example, 0x1A means A = 11, which corresponds to channel 12 (counting from 1)
                        const ch = this.midiChannels[channel];

                        switch (a3) {
                            default: {
                                // This is some other GS sysex...
                                SpessaLog.gsFail("Patch Part Parameter", [a3]);
                                break;
                            }

                            case 0x00:
                            case 0x01: {
                                // Tone map number (cc#32)
                                ch.controllerChange(
                                    MIDIControllers.bankSelectLSB,
                                    data
                                );
                                break;
                            }

                            case 0x22: {
                                // EFX assign
                                const efx = data === 1;
                                ch.setMIDIParameter("efxAssign", efx);
                                this.insertionActive ||= efx;
                                SpessaLog.gsInfo(
                                    `EFX assign for ${channel}`,
                                    efx ? "EFX" : "BYPASS"
                                );
                            }
                        }
                        return;
                    }
                    SpessaLog.gsFail("Patch Parameter", syx);
                    return;
                }
                // Drum setup
                if (a1 === 0x41 || a1 === 0x51) {
                    // 51 means BLOCK B (+16 channels)
                    // Testcase: 95043-2.KYC.mid
                    if (this.systemParameters.drumLock) return;
                    const map = (a2 >> 4) + 1;
                    const drumKey = a3;
                    const param = a2 & 0xf;
                    switch (param) {
                        default: {
                            SpessaLog.gsFail("Drum Setup", [param]);
                            return;
                        }

                        case 0x0: {
                            // Drum map name
                            const patchName = readBinaryString(syx, 12, 7);
                            SpessaLog.gsInfo(
                                `Drum Map Name for MAP${map}`,
                                patchName
                            );
                            this.callEvent("displayMessage", [...syx]);
                            break;
                        }

                        case 0x1: {
                            // Here it's relative to 60, not 64 like NRPN. For some reason...

                            const pitch = data - 60;
                            for (const ch of this.midiChannels) {
                                if (ch.midiParameters.drumMap !== map) continue;
                                // Apply same thing: SC-55 uses 100 cents, SC-88 and above is 50
                                ch.drumParams[drumKey].pitchCoarse =
                                    pitch * (ch.patch.bankLSB === 1 ? 1 : 0.5);
                            }
                            SpessaLog.gsInfo(
                                `Drum Pitch for MAP${map}, key ${drumKey}`,
                                pitch
                            );
                            break;
                        }

                        case 0x2: {
                            // Drum Level
                            for (const ch of this.midiChannels) {
                                if (ch.midiParameters.drumMap !== map) continue;
                                ch.drumParams[drumKey].level = data;
                            }
                            SpessaLog.gsInfo(
                                `Drum Level for MAP${map}, key ${drumKey}`,
                                data
                            );
                            break;
                        }

                        case 0x3: {
                            // Drum Assign Group (exclusive class)
                            for (const ch of this.midiChannels) {
                                if (ch.midiParameters.drumMap !== map) continue;
                                ch.drumParams[drumKey].assignGroup = data;
                            }
                            SpessaLog.gsInfo(
                                `Drum Assign Group for MAP${map}, key ${drumKey}`,
                                data
                            );
                            break;
                        }

                        case 0x4: {
                            // Pan
                            for (const ch of this.midiChannels) {
                                if (ch.midiParameters.drumMap !== map) continue;
                                ch.drumParams[drumKey].pan = data;
                            }
                            SpessaLog.gsInfo(
                                `Drum Pan for MAP${map}, key ${drumKey}`,
                                data
                            );
                            break;
                        }

                        case 0x5: {
                            // Reverb
                            for (const ch of this.midiChannels) {
                                if (ch.midiParameters.drumMap !== map) continue;
                                ch.drumParams[drumKey].reverbSend = data;
                            }
                            SpessaLog.gsInfo(
                                `Drum Reverb for MAP${map}, key ${drumKey}`,
                                data
                            );
                            break;
                        }

                        case 0x6: {
                            // Chorus
                            for (const ch of this.midiChannels) {
                                if (ch.midiParameters.drumMap !== map) continue;
                                ch.drumParams[drumKey].chorusSend = data;
                            }
                            SpessaLog.gsInfo(
                                `Drum Chorus for MAP${map}, key ${drumKey}`,
                                data
                            );
                            break;
                        }

                        case 0x7: {
                            // Receive Note Off
                            for (const ch of this.midiChannels) {
                                if (ch.midiParameters.drumMap !== map) continue;
                                ch.drumParams[drumKey].rxNoteOff = data === 1;
                            }
                            SpessaLog.gsInfo(
                                `Drum Note Off for MAP${map}, key ${drumKey}`,
                                data === 1 ? "ON" : "OFF"
                            );
                            break;
                        }

                        case 0x8: {
                            // Receive Note On
                            for (const ch of this.midiChannels) {
                                if (ch.midiParameters.drumMap !== map) continue;
                                ch.drumParams[drumKey].rxNoteOn = data === 1;
                            }
                            SpessaLog.gsInfo(
                                `Drum Note On for MAP${map}, key ${drumKey}`,
                                data === 1 ? "ON" : "OFF"
                            );
                            break;
                        }

                        case 0x9: {
                            // Delay
                            for (const ch of this.midiChannels) {
                                if (ch.midiParameters.drumMap !== map) continue;
                                ch.drumParams[drumKey].variationSend = data;
                            }
                            SpessaLog.gsInfo(
                                `Drum Delay for MAP${map}, key ${drumKey}`,
                                data
                            );
                            break;
                        }
                    }
                    return;
                }
                // User drum set
                if (a1 === 0x21) {
                    if (this.systemParameters.userDrumLock) return;
                    const drumSetNumber = a2 >> 4;
                    const drumSet =
                        this.soundBankManager.userDrumSets[drumSetNumber];
                    const drumKey = a3;
                    const command = a2 & 0xf;
                    switch (command) {
                        default: {
                            SpessaLog.gsFail("User Drum set", syx);
                            return;
                        }

                        // User drum set name
                        case 0: {
                            const newName = readBinaryString(syx, 12, 7);
                            drumSet.name = newName;
                            SpessaLog.gsInfo(
                                `User Drum Set ${drumSetNumber} name`,
                                newName
                            );
                            return;
                        }

                        case 0x1: {
                            // Here it's relative to 60, not 64 like NRPN. For some reason...
                            const pitch = data - 60;

                            // Use the full 100 cents here as we choose the correct pitch (50 or 100 cents) when committing changes
                            const binding = drumSet.keyBindings[drumKey];
                            binding.params.pitchCoarse = pitch;

                            SpessaLog.gsInfo(
                                `User Drum Set ${drumSetNumber} Pitch, key ${drumKey}`,
                                pitch
                            );
                            return;
                        }

                        case 0x2: {
                            // Drum Level
                            drumSet.keyBindings[drumKey].params.level = data;
                            SpessaLog.gsInfo(
                                `User Drum Set ${drumSetNumber} Level, key ${drumKey}`,
                                data
                            );
                            return;
                        }

                        case 0x3: {
                            // Drum Assign Group (exclusive class)
                            drumSet.keyBindings[drumKey].params.assignGroup =
                                data;
                            SpessaLog.gsInfo(
                                `User Drum Set ${drumSetNumber} Assign Group, key ${drumKey}`,
                                data
                            );
                            return;
                        }

                        case 0x4: {
                            // Pan
                            drumSet.keyBindings[drumKey].params.pan = data;
                            SpessaLog.gsInfo(
                                `User Drum Set ${drumSetNumber} Pan, key ${drumKey}`,
                                data
                            );
                            return;
                        }

                        case 0x5: {
                            // Reverb
                            drumSet.keyBindings[drumKey].params.reverbSend =
                                data;
                            SpessaLog.gsInfo(
                                `User Drum Set ${drumSetNumber} Reverb, key ${drumKey}`,
                                data
                            );
                            return;
                        }

                        case 0x6: {
                            // Chorus
                            drumSet.keyBindings[drumKey].params.chorusSend =
                                data;
                            SpessaLog.gsInfo(
                                `User Drum Set ${drumSetNumber} Chorus, key ${drumKey}`,
                                data
                            );
                            return;
                        }

                        case 0x7: {
                            // Receive Note Off
                            drumSet.keyBindings[drumKey].params.rxNoteOff =
                                data === 1;

                            SpessaLog.gsInfo(
                                `User Drum Set ${drumSetNumber} Note Off, key ${drumKey}`,
                                data === 1 ? "ON" : "OFF"
                            );
                            return;
                        }

                        case 0x8: {
                            // Receive Note On
                            drumSet.keyBindings[drumKey].params.rxNoteOn =
                                data === 1;
                            SpessaLog.gsInfo(
                                `User Drum Set ${drumSetNumber} Note On, key ${drumKey}`,
                                data === 1 ? "ON" : "OFF"
                            );
                            return;
                        }

                        case 0x9: {
                            // Delay
                            drumSet.keyBindings[drumKey].params.variationSend =
                                data;
                            SpessaLog.gsInfo(
                                `User Drum Set ${drumSetNumber} Delay, key ${drumKey}`,
                                data
                            );
                            return;
                        }

                        // Source drum set
                        case 0xa: {
                            drumSet.setSourceMap(drumKey, data);
                            SpessaLog.gsInfo(
                                `User Drum Set ${drumSetNumber} source drum set for ${drumKey}`,
                                data
                            );
                            return;
                        }

                        // Program number
                        case 0xb: {
                            drumSet.setSourceProgram(drumKey, data);
                            SpessaLog.gsInfo(
                                `User Drum Set ${drumSetNumber} source program for ${drumKey}`,
                                data
                            );
                            return;
                        }

                        // Source note number
                        case 0xc: {
                            drumSet.setSourceNote(drumKey, data);
                            SpessaLog.gsInfo(
                                `User Drum Set ${drumSetNumber} source note for ${drumKey}`,
                                data
                            );
                            return;
                        }
                    }
                }
                // This is some other GS sysex...
                SpessaLog.gsFail("System Exclusive", syx);
                return;
            }

            // GS Display
            case 0x45: {
                // 0x45: GS Display Data
                // Check for embedded copyright
                // (Roland SC display sysex) http://www.bandtrax.com.au/sysex.htm
                // Sound Canvas Display
                if (syx[4] === 0x10) {
                    this.callEvent("displayMessage", [...syx]);
                }
                return;
            }

            // Some Roland
            // This sysEx gets emitted by Falcosoft MIDI Player
            case 0x16: {
                if (syx[4] === 0x10) {
                    // This is a roland master volume message
                    this.setMIDIParameter("volume", syx[7] / 100);
                    SpessaLog.coolInfo("Roland Master Volume Control", syx[7]);
                    return;
                } else {
                    SpessaLog.unsupported("Roland", syx);
                }
            }
        }
    } else {
        // This is something else...
        SpessaLog.unsupported("Roland", syx);
        return;
    }
}
