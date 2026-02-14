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
import {
    type ModulatorSourceEnum,
    modulatorSources
} from "../../../../soundbank/enums";
import { generatorTypes } from "../../../../soundbank/basic_soundbank/generator_types";
import { readBinaryString } from "../../../../utils/byte_functions/string";
import type { SynthesizerCore } from "../../synthesizer_core";

const coolInfo = (what: string, value: string | number | boolean) => {
    SpessaSynthInfo(
        `%cRoland GS ${what}%c for is now set to %c${value}%c.`,
        consoleColors.recognized,
        consoleColors.info,
        consoleColors.value,
        consoleColors.info
    );
};

/**
 * Handles a GS system exclusive
 * http://www.bandtrax.com.au/sysex.htm
 * https://cdn.roland.com/assets/media/pdf/AT-20R_30R_MI.pdf
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
            case 0x42: {
                {
                    // This is a GS sysex
                    const addr1 = syx[4];
                    const addr2 = syx[5];
                    const addr3 = syx[6];

                    // Sanity check
                    const data = Math.min(syx[7], 127);
                    // SYSTEM MODE SET
                    if (
                        addr1 === 0 &&
                        addr2 === 0 &&
                        addr3 === 0x7f &&
                        data === 0x00
                    ) {
                        // This is a GS reset
                        SpessaSynthInfo(
                            "%cGS Reset received!",
                            consoleColors.info
                        );
                        this.resetAllControllers("gs");
                        return;
                    }

                    // Patch Parameter
                    if (addr1 === 0x40) {
                        // System Parameter
                        if (addr2 === 0x00) {
                            switch (addr3) {
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
                        if (addr2 === 0x01) {
                            /*
                            0x40 - chorus to delay
                            0x50 - delay macro (1st delay param)
                            0x5A - delay to reverb (last delay param)
                            enable delay that way
                             */
                            this.delayActive ||=
                                addr3 === 0x40 ||
                                (addr3 >= 0x50 && addr3 <= 0x5a);

                            switch (addr3) {
                                default: {
                                    SpessaSynthInfo(
                                        `%cUnsupported Patch Common parameter: %c${addr3.toString(16)}`,
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
                                        `Patch Name for ${addr3 & 0x0f}`,
                                        patchName
                                    );
                                    break;
                                }

                                case 0x30: {
                                    // Reverb macro
                                    this.setReverbMacro(data);
                                    coolInfo("Reverb Macro", data);
                                    break;
                                }

                                case 0x31: {
                                    // Reverb character
                                    this.reverbProcessor.character = data;
                                    coolInfo("Reverb Character", data);
                                    break;
                                }

                                case 0x32: {
                                    // Reverb pre-PLF
                                    this.reverbProcessor.preLowpass = data;
                                    coolInfo("Reverb Pre-LPF", data);
                                    break;
                                }

                                case 0x33: {
                                    // Reverb level
                                    this.reverbProcessor.level = data;
                                    coolInfo("Reverb Level", data);
                                    break;
                                }

                                case 0x34: {
                                    // Reverb time
                                    this.reverbProcessor.time = data;
                                    coolInfo("Reverb Time", data);
                                    break;
                                }

                                case 0x35: {
                                    // Reverb delay feedback
                                    this.reverbProcessor.delayFeedback = data;
                                    coolInfo("Reverb Delay Feedback", data);
                                    break;
                                }

                                // No 0x36??
                                case 0x37: {
                                    // Reverb predelay time
                                    this.reverbProcessor.preDelayTime = data;
                                    coolInfo("Reverb Predelay Time", data);
                                    break;
                                }

                                case 0x38: {
                                    // Chorus macro
                                    this.setChorusMacro(data);
                                    coolInfo("Chorus Macro", data);
                                    break;
                                }

                                case 0x39: {
                                    // Chorus pre-LPF
                                    this.chorusProcessor.preLowpass = data;
                                    break;
                                }
                                case 0x3a: {
                                    // Chorus level
                                    this.chorusProcessor.level = data;
                                    coolInfo("Chorus Level", data);
                                    break;
                                }

                                case 0x3b: {
                                    // Chorus feedback
                                    this.chorusProcessor.feedback = data;
                                    coolInfo("Chorus Feedback", data);
                                    break;
                                }

                                case 0x3c: {
                                    // Chorus delay
                                    this.chorusProcessor.delay = data;
                                    coolInfo("Chorus Delay", data);
                                    break;
                                }

                                case 0x3d: {
                                    // Chorus rate
                                    this.chorusProcessor.rate = data;
                                    coolInfo("Chorus Rate", data);
                                    break;
                                }

                                case 0x3e: {
                                    // Chorus depth
                                    this.chorusProcessor.depth = data;
                                    coolInfo("Chorus Depth", data);
                                    break;
                                }

                                case 0x3f: {
                                    // Chorus send level to reverb
                                    this.chorusToReverb = data / 127;
                                    coolInfo(
                                        "Chorus Send Level To Reverb",
                                        data
                                    );
                                    break;
                                }

                                case 0x40: {
                                    // Chorus send level to delay
                                    this.chorusToDelay = data / 127;
                                    coolInfo(
                                        "Chorus Send Level To Delay",
                                        data
                                    );
                                    break;
                                }
                            }
                        }

                        if (addr2 >> 4 === 1) {
                            // This is an individual part (channel) parameter
                            // Determine the channel
                            // Note that: 0 means channel 9 (drums), and only then 1 means channel 0, 2 channel 1, etc.
                            // SC-88Pro manual page 196
                            const channel =
                                [
                                    9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12,
                                    13, 14, 15
                                ][addr2 & 0x0f] + channelOffset;
                            // For example, 0x1A means A = 11, which corresponds to channel 12 (counting from 1)
                            const channelObject = this.midiChannels[channel];
                            switch (addr3) {
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
                                    // IGNORED!
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
                        if (addr2 >> 4 === 2) {
                            // This is an individual part (channel) parameter
                            // Determine the channel
                            // Note that: 0 means channel 9 (drums), and only then 1 means channel 0, 2 channel 1, etc.
                            // SC-88Pro manual page 196
                            const channel =
                                [
                                    9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12,
                                    13, 14, 15
                                ][addr2 & 0x0f] + channelOffset;
                            // For example, 0x1A means A = 11, which corresponds to channel 12 (counting from 1)
                            const channelObject = this.midiChannels[channel];
                            const centeredValue = data - 64;
                            const normalizedValue = centeredValue / 64;
                            const normalizedNotCentered = data / 128;

                            // Setup receivers for cc to parameter (sc-88 manual page 198)
                            const setupReceivers = (
                                source: number,
                                sourceName: string,
                                bipolar = false
                            ) => {
                                switch (addr3 & 0x0f) {
                                    case 0x00: {
                                        // See https://github.com/spessasus/SpessaSynth/issues/154
                                        // Pitch control
                                        // Special case:
                                        // If the source is a pitch wheel, it's a strange way of setting the pitch wheel range
                                        // Testcase: th07_03.mid
                                        if (
                                            source ===
                                            NON_CC_INDEX_OFFSET +
                                                modulatorSources.pitchWheel
                                        ) {
                                            channelObject.controllerChange(
                                                midiControllers.registeredParameterMSB,
                                                0x0
                                            );
                                            channelObject.controllerChange(
                                                midiControllers.registeredParameterLSB,
                                                0x0
                                            );
                                            channelObject.controllerChange(
                                                midiControllers.dataEntryMSB,
                                                Math.floor(centeredValue)
                                            );
                                        } else {
                                            channelObject.sysExModulators.setModulator(
                                                source as ModulatorSourceEnum,
                                                generatorTypes.fineTune,
                                                centeredValue * 100,
                                                bipolar
                                            );
                                            sysExLogging(
                                                channel,
                                                centeredValue,
                                                `${sourceName} pitch control`,
                                                "semitones"
                                            );
                                        }
                                        break;
                                    }

                                    case 0x01: {
                                        // Cutoff
                                        channelObject.sysExModulators.setModulator(
                                            source as ModulatorSourceEnum,
                                            generatorTypes.initialFilterFc,
                                            normalizedValue * 9600,
                                            bipolar
                                        );
                                        sysExLogging(
                                            channel,
                                            normalizedValue * 9600,
                                            `${sourceName} pitch control`,
                                            "cents"
                                        );
                                        break;
                                    }

                                    case 0x02: {
                                        // Amplitude
                                        channelObject.sysExModulators.setModulator(
                                            source as ModulatorSourceEnum,
                                            generatorTypes.initialAttenuation,
                                            normalizedValue * 960, // Spec says "100%" so 960cB in sf2
                                            bipolar
                                        );
                                        sysExLogging(
                                            channel,
                                            normalizedValue * 960,
                                            `${sourceName} amplitude`,
                                            "cB"
                                        );
                                        break;
                                    }

                                    // Rate control is ignored as it is in hertz

                                    case 0x04: {
                                        // LFO1 pitch depth
                                        channelObject.sysExModulators.setModulator(
                                            source as ModulatorSourceEnum,
                                            generatorTypes.vibLfoToPitch,
                                            normalizedNotCentered * 600,
                                            bipolar
                                        );
                                        sysExLogging(
                                            channel,
                                            normalizedNotCentered * 600,
                                            `${sourceName} LFO1 pitch depth`,
                                            "cents"
                                        );
                                        break;
                                    }

                                    case 0x05: {
                                        // LFO1 filter depth
                                        channelObject.sysExModulators.setModulator(
                                            source as ModulatorSourceEnum,
                                            generatorTypes.vibLfoToFilterFc,
                                            normalizedNotCentered * 2400,
                                            bipolar
                                        );
                                        sysExLogging(
                                            channel,
                                            normalizedNotCentered * 2400,
                                            `${sourceName} LFO1 filter depth`,
                                            "cents"
                                        );
                                        break;
                                    }

                                    case 0x06: {
                                        // LFO1 amplitude depth
                                        channelObject.sysExModulators.setModulator(
                                            source as ModulatorSourceEnum,
                                            generatorTypes.vibLfoToVolume,
                                            normalizedValue * 960,
                                            bipolar
                                        );
                                        sysExLogging(
                                            channel,
                                            normalizedValue * 960,
                                            `${sourceName} LFO1 amplitude depth`,
                                            "cB"
                                        );
                                        break;
                                    }

                                    // Rate control is ignored as it is in hertz

                                    case 0x08: {
                                        // LFO2 pitch depth
                                        channelObject.sysExModulators.setModulator(
                                            source as ModulatorSourceEnum,
                                            generatorTypes.modLfoToPitch,
                                            normalizedNotCentered * 600,
                                            bipolar
                                        );
                                        sysExLogging(
                                            channel,
                                            normalizedNotCentered * 600,
                                            `${sourceName} LFO2 pitch depth`,
                                            "cents"
                                        );
                                        break;
                                    }

                                    case 0x09: {
                                        // LFO2 filter depth
                                        channelObject.sysExModulators.setModulator(
                                            source as ModulatorSourceEnum,
                                            generatorTypes.modLfoToFilterFc,
                                            normalizedNotCentered * 2400,
                                            bipolar
                                        );
                                        sysExLogging(
                                            channel,
                                            normalizedNotCentered * 2400,
                                            `${sourceName} LFO2 filter depth`,
                                            "cents"
                                        );
                                        break;
                                    }

                                    case 0x0a: {
                                        // LFO2 amplitude depth
                                        channelObject.sysExModulators.setModulator(
                                            source as ModulatorSourceEnum,
                                            generatorTypes.modLfoToVolume,
                                            normalizedValue * 960,
                                            bipolar
                                        );
                                        sysExLogging(
                                            channel,
                                            normalizedValue * 960,
                                            `${sourceName} LFO2 amplitude depth`,
                                            "cB"
                                        );
                                        break;
                                    }
                                }
                            };

                            // SC88 manual page 198
                            switch (addr3 & 0xf0) {
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
                                    setupReceivers(
                                        midiControllers.modulationWheel,
                                        "mod wheel"
                                    );
                                    break;
                                }

                                case 0x10: {
                                    // Pitch wheel
                                    setupReceivers(
                                        NON_CC_INDEX_OFFSET +
                                            modulatorSources.pitchWheel,
                                        "pitch wheel",
                                        true
                                    );
                                    break;
                                }

                                case 0x20: {
                                    // Channel pressure
                                    setupReceivers(
                                        NON_CC_INDEX_OFFSET +
                                            modulatorSources.channelPressure,
                                        "channel pressure"
                                    );
                                    break;
                                }

                                case 0x30: {
                                    // Poly pressure
                                    setupReceivers(
                                        NON_CC_INDEX_OFFSET +
                                            modulatorSources.polyPressure,
                                        "poly pressure"
                                    );
                                    break;
                                }

                                case 0x40: {
                                    // CC1
                                    setupReceivers(channelObject.cc1, "CC1");
                                    break;
                                }

                                case 0x50: {
                                    // CC2
                                    setupReceivers(channelObject.cc2, "CC2");
                                }
                            }
                            return;
                        }
                        // Patch Parameter Tone Map
                        else if (addr2 >> 4 === 4) {
                            // This is an individual part (channel) parameter
                            // Determine the channel
                            // Note that: 0 means channel 9 (drums), and only then 1 means channel 0, 2 channel 1, etc.
                            // SC-88Pro manual page 196
                            const channel =
                                [
                                    9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12,
                                    13, 14, 15
                                ][addr2 & 0x0f] + channelOffset;
                            // For example, 0x1A means A = 11, which corresponds to channel 12 (counting from 1)
                            const channelObject = this.midiChannels[channel];

                            switch (addr3) {
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
                                    // Tone map number (cc32)
                                    channelObject.controllerChange(
                                        midiControllers.bankSelectLSB,
                                        data
                                    );
                                    break;
                                }
                            }
                        }
                    } else if (addr1 === 0x41) {
                        // Drum setup
                        const map = (addr2 >> 4) + 1;
                        const drumKey = addr3;
                        const param = addr2 & 0xf;
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
                                const pitch = (data - 60) * 50;
                                for (const ch of this.midiChannels) {
                                    if (ch.drumMap !== map) continue;
                                    ch.drumParams[drumKey].pitch = pitch;
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
                                // Pan
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
                        }
                    } else {
                        // This is some other GS sysex...
                        sysExNotRecognized(syx, "Roland GS");
                        return;
                    }
                }
                return;
            }

            case 0x45: {
                // 0x45: GS Display Data
                // Check for embedded copyright
                // (roland SC display sysex) http://www.bandtrax.com.au/sysex.htm

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

            case 0x16: {
                // Some Roland
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
        sysExNotRecognized(syx, "Roland GS");
        return;
    }
}
