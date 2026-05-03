import {
    type SysExAcceptedArray,
    sysExLogging,
    sysExNotRecognized
} from "./helpers";
import { SpessaSynthInfo } from "../../../../utils/loggin";
import { consoleColors } from "../../../../utils/other";
import { customControllers } from "../../../enums";
import { midiControllers } from "../../../../midi/enums";
import { NON_CC_INDEX_OFFSET } from "../../engine_components/controller_tables";
import { modulatorSources } from "../../../../soundbank/enums";
import { readBinaryString } from "../../../../utils/byte_functions/string";
import type { SynthesizerCore } from "../../synthesizer_core";
import { SysEx } from "../../../../utils/sysex";
import { EFX_SENDS_GAIN_CORRECTION } from "../../engine_components/synth_constants";

const coolInfo = (what: string, value: string | number | boolean) => {
    SpessaSynthInfo(
        `%cRoland GS ${what}%c is now set to %c${value}%c.`,
        consoleColors.recognized,
        consoleColors.info,
        consoleColors.value,
        consoleColors.info
    );
};

/**
 * Handles a GS system exclusive
 * http://www.bandtrax.com.au/sysex.htm
 * https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf
 * @param syx
 * @param channelOffset
 */
export function handleGS(
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
                {
                    // This is a GS sysex
                    const a1 = syx[4];
                    const a2 = syx[5];
                    const a3 = syx[6];

                    // Sanity check
                    const data = Math.min(syx[7], 127);
                    // SYSTEM MODE SET
                    if (a1 === 0 && a2 === 0 && a3 === 0x7f && data === 0x00) {
                        // This is a GS reset
                        SpessaSynthInfo(
                            "%cGS Reset received!",
                            consoleColors.info
                        );
                        this.resetAllControllers("gs");
                        return;
                    }

                    // Patch Parameter
                    if (a1 === 0x40) {
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
                                    this.setMasterTuning(cents);
                                    coolInfo("Master Tune", cents);
                                    break;
                                }

                                case 0x04: {
                                    // Roland GS master volume
                                    coolInfo("Master Volume", data);
                                    break;
                                }

                                case 0x05: {
                                    // Roland master key shift (transpose)
                                    const transpose = data - 64;
                                    coolInfo("Master Key-Shift", transpose);
                                    this.setMasterTuning(transpose * 100);
                                    break;
                                }

                                case 0x06: {
                                    // Roland master pan
                                    coolInfo("Master Pan", data);
                                    this.setMasterParameter(
                                        "masterPan",
                                        (data - 64) / 64
                                    );
                                    break;
                                }

                                case 0x7f: {
                                    // Roland mode set
                                    // GS mode set
                                    if (data === 0x00) {
                                        // This is a GS reset
                                        SpessaSynthInfo(
                                            "%cGS Reset received!",
                                            consoleColors.info
                                        );
                                        this.resetAllControllers("gs");
                                    } else if (data === 0x7f) {
                                        // GS mode off
                                        SpessaSynthInfo(
                                            "%cGS system off, switching to GM",
                                            consoleColors.info
                                        );
                                        this.resetAllControllers("gm");
                                    }
                                    break;
                                }

                                default: {
                                    sysExNotRecognized(syx, "Roland GS");
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
                            if (isReverb && this.masterParameters.reverbLock)
                                return;
                            if (isChorus && this.masterParameters.chorusLock)
                                return;
                            if (isDelay && this.masterParameters.delayLock)
                                return;
                            /*
                            0x40 - chorus to delay
                            enable delay that way
                             */
                            this.delayActive ||= a3 === 0x40 || isDelay;

                            switch (a3) {
                                default: {
                                    SpessaSynthInfo(
                                        `%cUnsupported Patch Common parameter: %c${a3.toString(16)}`,
                                        consoleColors.warn,
                                        consoleColors.unrecognized
                                    );
                                    break;
                                }

                                case 0x00: {
                                    // Patch name. cool!
                                    // Not sure what to do with it, but let's log it!
                                    const patchName = readBinaryString(
                                        syx,
                                        16,
                                        7
                                    );
                                    coolInfo(
                                        `Patch Name for ${a3 & 0x0f}`,
                                        patchName
                                    );
                                    break;
                                }
                                // Reverb
                                case 0x30: {
                                    // Reverb macro
                                    this.setReverbMacro(data);
                                    coolInfo("Reverb Macro", data);
                                    // Event called in setMacro
                                    break;
                                }
                                case 0x31: {
                                    // Reverb character
                                    this.reverbProcessor.character = data;
                                    coolInfo("Reverb Character", data);
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
                                    coolInfo("Reverb Pre-LPF", data);
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
                                    coolInfo("Reverb Level", data);
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
                                    coolInfo("Reverb Time", data);
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
                                    coolInfo("Reverb Delay Feedback", data);
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
                                    coolInfo("Reverb Predelay Time", data);
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
                                    coolInfo("Chorus Macro", data);
                                    // Event called in setMacro
                                    break;
                                }
                                case 0x39: {
                                    // Chorus pre-LPF
                                    this.chorusProcessor.preLowpass = data;
                                    coolInfo("Pre-LPF", data);
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
                                    coolInfo("Chorus Level", data);
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
                                    coolInfo("Chorus Feedback", data);
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
                                    coolInfo("Chorus Delay", data);
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
                                    coolInfo("Chorus Rate", data);
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
                                    coolInfo("Chorus Depth", data);
                                    this.callEvent("effectChange", {
                                        effect: "chorus",
                                        parameter: "depth",
                                        value: data
                                    });
                                    break;
                                }
                                case 0x3f: {
                                    // Chorus send level to reverb
                                    this.chorusProcessor.sendLevelToReverb =
                                        data;
                                    coolInfo(
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
                                    this.chorusProcessor.sendLevelToDelay =
                                        data;
                                    coolInfo(
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
                                    coolInfo("Delay Macro", data);
                                    // Event called in setMacro
                                    break;
                                }
                                case 0x51: {
                                    // Delay pre-PLF
                                    this.delayProcessor.preLowpass = data;
                                    coolInfo("Delay Pre-LPF", data);
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
                                    coolInfo("Delay Time Center", data);
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
                                    coolInfo("Delay Time Ratio Left", data);
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
                                    coolInfo("Delay Time Ratio Right", data);
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
                                    coolInfo("Delay Level Center", data);
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
                                    coolInfo("Delay Level Left", data);
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
                                    coolInfo("Delay Level Right", data);
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
                                    coolInfo("Delay Level", data);
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
                                    coolInfo("Delay Feedback", data);
                                    this.callEvent("effectChange", {
                                        effect: "delay",
                                        parameter: "feedback",
                                        value: data
                                    });
                                    break;
                                }
                                case 0x5a: {
                                    // Delay send level to reverb
                                    this.delayProcessor.sendLevelToReverb =
                                        data;
                                    coolInfo(
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
                            if (this.masterParameters.insertionEffectLock)
                                return;

                            // Write parameters
                            if (a3 >= 0x03 && a3 <= 0x19)
                                this.insertionParams[a3 - 3] = data;

                            if (a3 >= 0x03 && a3 <= 0x16) {
                                this.insertionProcessor.setParameter(a3, data);
                                coolInfo(`EFX Parameter ${a3 - 2}`, data);
                                this.callEvent("effectChange", {
                                    effect: "insertion",
                                    parameter: a3,
                                    value: data
                                });
                                return;
                            }
                            switch (a3) {
                                default: {
                                    sysExNotRecognized(syx, "Roland GS EFX");
                                    return;
                                }

                                case 0x00: {
                                    // EFX Type
                                    const type = (data << 8) | syx[8];
                                    const proc =
                                        this.insertionEffects.get(type);
                                    if (proc) {
                                        coolInfo("EFX Type", type.toString(16));
                                        this.insertionProcessor = proc;
                                    } else {
                                        this.insertionProcessor =
                                            this.insertionFallback;
                                        SpessaSynthInfo(
                                            `%cUnsupported EFX processor: %c${type.toString(16)}%c, using Thru.`,
                                            consoleColors.warn,
                                            consoleColors.unrecognized,
                                            consoleColors.warn
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
                                        (data / 127) *
                                        EFX_SENDS_GAIN_CORRECTION;
                                    coolInfo("EFX Send Level to Reverb", data);
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
                                        (data / 127) *
                                        EFX_SENDS_GAIN_CORRECTION;
                                    coolInfo("EFX Send Level to Chorus", data);
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
                                        (data / 127) *
                                        EFX_SENDS_GAIN_CORRECTION;
                                    this.delayActive = true;
                                    coolInfo("EFX Send Level to Delay", data);
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
                                SysEx.syxToChannel(a2 & 0x0f) + channelOffset;
                            // For example, 0x1A means A = 11, which corresponds to channel 12 (counting from 1)
                            const channelObject = this.midiChannels[channel];
                            switch (a3) {
                                default: {
                                    // This is some other GS sysex...
                                    sysExNotRecognized(syx, "Roland GS");
                                    return;
                                }

                                case 0x00: {
                                    // Tone number (program change)
                                    channelObject.controllerChange(
                                        midiControllers.bankSelect,
                                        data
                                    );
                                    channelObject.programChange(syx[8]);
                                    break;
                                }

                                case 0x02: {
                                    // Rx. channel (0x10 is OFF)
                                    channelObject.rxChannel =
                                        data === 0x10
                                            ? -1
                                            : data + channelOffset;
                                    this.customChannelNumbers ||=
                                        channelObject.rxChannel !==
                                        channelObject.channel;
                                    coolInfo(
                                        `Rx. Channel on ${channel}`,
                                        channelObject.rxChannel
                                    );
                                    break;
                                }

                                case 0x13: {
                                    // Mono/poly
                                    channelObject.polyMode = data === 1;
                                    coolInfo(
                                        `Mono/poly on ${channel}`,
                                        channelObject.polyMode ? "POLY" : "MONO"
                                    );
                                    break;
                                }

                                case 0x14: {
                                    channelObject.assignMode = data;
                                    coolInfo(`Assign mode on ${channel}`, data);
                                    break;
                                }

                                case 0x15: {
                                    // This is the Use for Drum Part sysex (multiple drums)
                                    channelObject.drumMap = data;
                                    const isDrums = data > 0; // If set to other than 0, is a drum channel
                                    channelObject.setGSDrums(isDrums);
                                    coolInfo(
                                        `Drums on ${channel}`,
                                        isDrums.toString()
                                    );
                                    return;
                                }

                                case 0x16: {
                                    // This is the pitch key shift sysex
                                    const keyShift = data - 64;
                                    channelObject.setCustomController(
                                        customControllers.channelKeyShift,
                                        keyShift
                                    );
                                    coolInfo(
                                        `Key shift on ${channel}`,
                                        keyShift
                                    );
                                    return;
                                }

                                // Pitch offset fine in Hz is not supported so far

                                case 0x19: {
                                    // Part level (cc#7)
                                    channelObject.controllerChange(
                                        midiControllers.mainVolume,
                                        data
                                    );
                                    return;
                                }

                                // Pan position
                                case 0x1c: {
                                    // 0 is random
                                    const panPosition = data;
                                    if (panPosition === 0) {
                                        channelObject.randomPan = true;
                                        coolInfo(
                                            `Random pan on ${channel}`,
                                            "ON"
                                        );
                                    } else {
                                        channelObject.randomPan = false;
                                        channelObject.controllerChange(
                                            midiControllers.pan,
                                            panPosition
                                        );
                                    }
                                    break;
                                }

                                case 0x1f: {
                                    // CC1 controller number
                                    channelObject.cc1 = data;
                                    coolInfo("CC1 Controller Number", data);
                                    break;
                                }

                                case 0x20: {
                                    // CC2controller number
                                    channelObject.cc2 = data;
                                    coolInfo("CC2 Controller Number", data);
                                    break;
                                }

                                // Chorus send
                                case 0x21: {
                                    channelObject.controllerChange(
                                        midiControllers.chorusDepth,
                                        data
                                    );
                                    break;
                                }

                                // Reverb send
                                case 0x22: {
                                    channelObject.controllerChange(
                                        midiControllers.reverbDepth,
                                        data
                                    );
                                    break;
                                }

                                case 0x2a: {
                                    // Fine tune
                                    // 0-16384
                                    const tune = (data << 7) | syx[8];
                                    const tuneCents = (tune - 8192) / 81.92;
                                    channelObject.setTuning(tuneCents);
                                    break;
                                }

                                // Delay send
                                case 0x2c: {
                                    channelObject.controllerChange(
                                        midiControllers.variationDepth,
                                        data
                                    );
                                    break;
                                }

                                case 0x30: {
                                    // Vibrato rate
                                    channelObject.controllerChange(
                                        midiControllers.vibratoRate,
                                        data
                                    );
                                    break;
                                }

                                case 0x31: {
                                    // Vibrato depth
                                    channelObject.controllerChange(
                                        midiControllers.vibratoDepth,
                                        data
                                    );
                                    break;
                                }

                                case 0x32: {
                                    // Filter cutoff
                                    // It's so out of order, Roland...
                                    channelObject.controllerChange(
                                        midiControllers.brightness,
                                        data
                                    );
                                    break;
                                }

                                case 0x33: {
                                    // Filter resonance
                                    channelObject.controllerChange(
                                        midiControllers.filterResonance,
                                        data
                                    );
                                    break;
                                }

                                case 0x34: {
                                    // Attack time
                                    channelObject.controllerChange(
                                        midiControllers.attackTime,
                                        data
                                    );
                                    break;
                                }

                                case 0x35: {
                                    // Decay time
                                    channelObject.controllerChange(
                                        midiControllers.decayTime,
                                        data
                                    );
                                    break;
                                }

                                case 0x36: {
                                    // Release time
                                    channelObject.controllerChange(
                                        midiControllers.releaseTime,
                                        data
                                    );
                                    break;
                                }

                                case 0x37: {
                                    // Vibrato delay
                                    // It seems that they forgot about it and put it last...
                                    channelObject.controllerChange(
                                        midiControllers.vibratoDelay,
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
                                    channelObject.setOctaveTuning(newTuning);
                                    const cents = data - 64;
                                    coolInfo(
                                        `Octave Scale Tuning on ${channel}`,
                                        newTuning.join(", ")
                                    );
                                    channelObject.setTuning(cents);
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
                                SysEx.syxToChannel(a2 & 0x0f) + channelOffset;
                            // For example, 0x1A means A = 11, which corresponds to channel 12 (counting from 1)
                            const ch = this.midiChannels[channel];
                            switch (a3 & 0xf0) {
                                default: {
                                    // This is some other GS sysex...
                                    sysExNotRecognized(
                                        syx,
                                        "Roland GS Patch Parameter Controller"
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
                                        ch.customControllers[
                                            customControllers.modulationMultiplier
                                        ] = cents / 50;
                                        sysExLogging(
                                            ch.channel,
                                            cents,
                                            "modulation wheel depth",
                                            "cents"
                                        );
                                        break;
                                    }
                                    ch.sysExModulators.setupReceiver(
                                        a3,
                                        data,
                                        midiControllers.modulationWheel,
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
                                        ch.midiControllers[
                                            NON_CC_INDEX_OFFSET +
                                                modulatorSources.pitchWheelRange
                                        ] = centeredValue << 7;
                                        sysExLogging(
                                            ch.channel,
                                            centeredValue,
                                            "pitch wheel range",
                                            "semitones"
                                        );
                                        break;
                                    }
                                    ch.sysExModulators.setupReceiver(
                                        a3,
                                        data,
                                        NON_CC_INDEX_OFFSET +
                                            modulatorSources.pitchWheel,
                                        "pitch wheel",
                                        true
                                    );
                                    break;
                                }

                                case 0x20: {
                                    // Channel pressure
                                    ch.sysExModulators.setupReceiver(
                                        a3,
                                        data,
                                        NON_CC_INDEX_OFFSET +
                                            modulatorSources.channelPressure,
                                        "channel pressure"
                                    );
                                    break;
                                }

                                case 0x30: {
                                    // Poly pressure
                                    ch.sysExModulators.setupReceiver(
                                        a3,
                                        data,
                                        NON_CC_INDEX_OFFSET +
                                            modulatorSources.polyPressure,
                                        "poly pressure"
                                    );
                                    break;
                                }

                                case 0x40: {
                                    // CC1
                                    ch.sysExModulators.setupReceiver(
                                        a3,
                                        data,
                                        ch.cc1,
                                        "CC1"
                                    );
                                    break;
                                }

                                case 0x50: {
                                    // CC2
                                    ch.sysExModulators.setupReceiver(
                                        a3,
                                        data,
                                        ch.cc2,
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
                                SysEx.syxToChannel(a2 & 0x0f) + channelOffset;
                            // For example, 0x1A means A = 11, which corresponds to channel 12 (counting from 1)
                            const channelObject = this.midiChannels[channel];

                            switch (a3) {
                                default: {
                                    // This is some other GS sysex...
                                    sysExNotRecognized(
                                        syx,
                                        "Roland GS Patch Part Parameter"
                                    );
                                    break;
                                }

                                case 0x00:
                                case 0x01: {
                                    // Tone map number (cc#32)
                                    channelObject.controllerChange(
                                        midiControllers.bankSelectLSB,
                                        data
                                    );
                                    break;
                                }

                                case 0x22: {
                                    if (
                                        this.masterParameters
                                            .insertionEffectLock
                                    )
                                        return;
                                    // EFX assign
                                    const efx = data === 1;
                                    channelObject.insertionEnabled = efx;
                                    this.insertionActive ||= efx;
                                    coolInfo(
                                        `Insertion for ${channel}`,
                                        efx ? "ON" : "OFF"
                                    );
                                    this.callEvent("effectChange", {
                                        effect: "insertion",
                                        parameter: efx ? -1 : -2,
                                        value: channel
                                    });
                                }
                            }
                            return;
                        }
                        sysExNotRecognized(syx, "Roland GS Patch Parameter");
                        return;
                    }
                    // Drum setup
                    if (a1 === 0x41) {
                        if (this.masterParameters.drumLock) return;
                        const map = (a2 >> 4) + 1;
                        const drumKey = a3;
                        const param = a2 & 0xf;
                        switch (param) {
                            default: {
                                sysExNotRecognized(syx, "Roland GS Drum Setup");
                                return;
                            }

                            case 0x0: {
                                // Drum map name. cool!
                                // Not sure what to do with it, but let's log it!
                                const patchName = readBinaryString(syx, 12, 7);
                                coolInfo(`Patch Name for MAP${map}`, patchName);
                                break;
                            }

                            case 0x1: {
                                // Here it's relative to 60, not 64 like NRPN. For some reason...

                                const pitch = data - 60;
                                for (const ch of this.midiChannels) {
                                    if (ch.drumMap !== map) continue;
                                    // Apply same thing: SC-55 uses 100 cents, SC-88 and above is 50
                                    ch.drumParams[drumKey].pitch =
                                        pitch *
                                        (ch.patch.bankLSB === 1 ? 100 : 50);
                                }
                                coolInfo(
                                    `Drum Pitch for MAP${map}, key ${drumKey}`,
                                    pitch
                                );
                                break;
                            }

                            case 0x2: {
                                // Drum Level
                                for (const ch of this.midiChannels) {
                                    if (ch.drumMap !== map) continue;
                                    ch.drumParams[drumKey].gain = data / 120;
                                }
                                coolInfo(
                                    `Drum Level for MAP${map}, key ${drumKey}`,
                                    data
                                );
                                break;
                            }

                            case 0x3: {
                                // Drum Assign Group (exclusive class)
                                for (const ch of this.midiChannels) {
                                    if (ch.drumMap !== map) continue;
                                    ch.drumParams[drumKey].exclusiveClass =
                                        data;
                                }
                                coolInfo(
                                    `Drum Assign Group for MAP${map}, key ${drumKey}`,
                                    data
                                );
                                break;
                            }

                            case 0x4: {
                                // Pan
                                for (const ch of this.midiChannels) {
                                    if (ch.drumMap !== map) continue;
                                    ch.drumParams[drumKey].pan = data;
                                }
                                coolInfo(
                                    `Drum Pan for MAP${map}, key ${drumKey}`,
                                    data
                                );
                                break;
                            }

                            case 0x5: {
                                // Reverb
                                for (const ch of this.midiChannels) {
                                    if (ch.drumMap !== map) continue;
                                    ch.drumParams[drumKey].reverbGain =
                                        data / 127;
                                }
                                coolInfo(
                                    `Drum Reverb for MAP${map}, key ${drumKey}`,
                                    data
                                );
                                break;
                            }

                            case 0x6: {
                                // Chorus
                                for (const ch of this.midiChannels) {
                                    if (ch.drumMap !== map) continue;
                                    ch.drumParams[drumKey].chorusGain =
                                        data / 127;
                                }
                                coolInfo(
                                    `Drum Chorus for MAP${map}, key ${drumKey}`,
                                    data
                                );
                                break;
                            }

                            case 0x7: {
                                // Receive Note Off
                                for (const ch of this.midiChannels) {
                                    if (ch.drumMap !== map) continue;
                                    ch.drumParams[drumKey].rxNoteOff =
                                        data === 1;
                                }
                                coolInfo(
                                    `Drum Note Off for MAP${map}, key ${drumKey}`,
                                    data === 1
                                );
                                break;
                            }

                            case 0x8: {
                                // Receive Note On
                                for (const ch of this.midiChannels) {
                                    if (ch.drumMap !== map) continue;
                                    ch.drumParams[drumKey].rxNoteOn =
                                        data === 1;
                                }
                                coolInfo(
                                    `Drum Note On for MAP${map}, key ${drumKey}`,
                                    data === 1
                                );
                                break;
                            }

                            case 0x9: {
                                // Delay
                                for (const ch of this.midiChannels) {
                                    if (ch.drumMap !== map) continue;
                                    ch.drumParams[drumKey].delayGain =
                                        data / 127;
                                }
                                coolInfo(
                                    `Drum Delay for MAP${map}, key ${drumKey}`,
                                    data
                                );
                                break;
                            }
                        }
                        return;
                    }
                    // This is some other GS sysex...
                    sysExNotRecognized(syx, "Roland GS");
                    return;
                }
            }

            // GS Display
            case 0x45: {
                // 0x45: GS Display Data
                // Check for embedded copyright
                // (Roland SC display sysex) http://www.bandtrax.com.au/sysex.htm

                if (
                    syx[4] === 0x10 // Sound Canvas Display
                ) {
                    if (syx[5] === 0x00) {
                        // Display letters
                        this.callEvent("synthDisplay", [...syx]);
                    } else if (syx[5] === 0x01) {
                        // Matrix display
                        this.callEvent("synthDisplay", [...syx]);
                    } else {
                        // This is some other GS sysex...
                        sysExNotRecognized(syx, "Roland GS Display");
                    }
                }
                return;
            }

            // Some Roland
            case 0x16: {
                if (syx[4] === 0x10) {
                    // This is a roland master volume message
                    this.setMIDIVolume(syx[7] / 100);
                    SpessaSynthInfo(
                        `%cRoland Master Volume control set to: %c${syx[7]}`,
                        consoleColors.info,
                        consoleColors.value
                    );
                    return;
                } else {
                    sysExNotRecognized(syx, "Roland");
                }
            }
        }
    } else {
        // This is something else...
        sysExNotRecognized(syx, "Roland");
        return;
    }
}
