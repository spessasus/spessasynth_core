import {
    type SysExAcceptedArray,
    sysExLogging,
    sysExNotRecognized
} from "./helpers";
import { SpessaSynthInfo } from "../../../../utils/loggin";
import { arrayToHexString, consoleColors } from "../../../../utils/other";
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
                // This is a GS sysex

                const messageValue = syx[7];
                // Syx[5] and [6] is the system parameter, syx[7] is the value
                // Either patch common or SC-88 mode set
                if (syx[4] === 0x40 || (syx[4] === 0x00 && syx[6] === 0x7f)) {
                    // This is a channel parameter
                    if ((syx[5] & 0x10) > 0) {
                        // This is an individual part (channel) parameter
                        // Determine the channel 0 means channel 10 (default), 1 means 1 etc.
                        // SC-88Pro manual page 196
                        const channel =
                            [
                                9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13,
                                14, 15
                            ][syx[5] & 0x0f] + channelOffset;
                        // For example, 0x1A means A = 11, which corresponds to channel 12 (counting from 1)
                        const channelObject = this.midiChannels[channel];
                        switch (syx[6]) {
                            default: {
                                // This is some other GS sysex...
                                sysExNotRecognized(syx, "Roland GS");
                                break;
                            }

                            case 0x15: {
                                // This is the Use for Drum Part sysex (multiple drums)
                                const isDrums =
                                    messageValue > 0 && syx[5] >> 4 > 0; // If set to other than 0, is a drum channel
                                channelObject.setGSDrums(isDrums);
                                SpessaSynthInfo(
                                    `%cChannel %c${channel}%c ${
                                        isDrums
                                            ? "is now a drum channel"
                                            : "now isn't a drum channel"
                                    }%c via: %c${arrayToHexString(syx)}`,
                                    consoleColors.info,
                                    consoleColors.value,
                                    consoleColors.recognized,
                                    consoleColors.info,
                                    consoleColors.value
                                );
                                return;
                            }

                            case 0x16: {
                                // This is the pitch key shift sysex
                                const keyShift = messageValue - 64;
                                channelObject.setCustomController(
                                    customControllers.channelKeyShift,
                                    keyShift
                                );
                                sysExLogging(
                                    syx,
                                    channel,
                                    keyShift,
                                    "key shift",
                                    "keys"
                                );
                                return;
                            }

                            // Pan position
                            case 0x1c: {
                                // 0 is random
                                const panPosition = messageValue;
                                if (panPosition === 0) {
                                    channelObject.randomPan = true;
                                    SpessaSynthInfo(
                                        `%cRandom pan is set to %cON%c for %c${channel}`,
                                        consoleColors.info,
                                        consoleColors.recognized,
                                        consoleColors.info,
                                        consoleColors.value
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

                            // Chorus send
                            case 0x21: {
                                channelObject.controllerChange(
                                    midiControllers.chorusDepth,
                                    messageValue
                                );
                                break;
                            }

                            // Reverb send
                            case 0x22: {
                                channelObject.controllerChange(
                                    midiControllers.reverbDepth,
                                    messageValue
                                );
                                break;
                            }

                            case 0x40:
                            case 0x41:
                            case 0x42:
                            case 0x43:
                            case 0x44:
                            case 0x45:
                            case 0x46:
                            case 0x47:
                            case 0x48:
                            case 0x49:
                            case 0x4a:
                            case 0x4b: {
                                // Scale tuning: up to 12 bytes
                                const tuningBytes = syx.length - 9; // Data starts at 7, minus checksum and f7
                                // Read em bytes
                                const newTuning = new Int8Array(12);
                                for (let i = 0; i < tuningBytes; i++) {
                                    newTuning[i] = syx[i + 7] - 64;
                                }
                                channelObject.setOctaveTuning(newTuning);
                                const cents = messageValue - 64;
                                sysExLogging(
                                    syx,
                                    channel,
                                    newTuning.join(" "),
                                    "octave scale tuning",
                                    "cents"
                                );
                                channelObject.setTuning(cents);
                                break;
                            }
                        }
                        return;
                    } else if ((syx[5] & 0x20) > 0) {
                        // This is a channel parameter also
                        // This is an individual part (channel) parameter
                        // Determine the channel 0 means channel 10 (default), 1 means 1 etc.
                        const channel =
                            [
                                9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13,
                                14, 15
                            ][syx[5] & 0x0f] + channelOffset;
                        // For example, 0x1A means A = 11, which corresponds to channel 12 (counting from 1)
                        const channelObject = this.midiChannels[channel];
                        const centeredValue = messageValue - 64;
                        const normalizedValue = centeredValue / 64;
                        const normalizedNotCentered = messageValue / 128;

                        // Setup receivers for cc to parameter (sc-88 manual page 198)
                        const setupReceivers = (
                            source: number,
                            sourceName: string,
                            bipolar = false
                        ) => {
                            switch (syx[6] & 0x0f) {
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
                                            syx,
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
                                        syx,
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
                                        syx,
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
                                        syx,
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
                                        syx,
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
                                        syx,
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
                                        syx,
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
                                        syx,
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
                                        syx,
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
                        switch (syx[6] & 0xf0) {
                            default: {
                                // This is some other GS sysex...
                                sysExNotRecognized(syx, "Roland GS");
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
                        }
                        return;
                    } else if (syx[5] === 0x00) {
                        // This is a global system parameter
                        switch (syx[6]) {
                            default: {
                                sysExNotRecognized(syx, "Roland GS");
                                break;
                            }

                            case 0x7f: {
                                // Roland mode set
                                // GS mode set
                                if (messageValue === 0x00) {
                                    // This is a GS reset
                                    SpessaSynthInfo(
                                        "%cGS Reset received!",
                                        consoleColors.info
                                    );
                                    this.resetAllControllers("gs");
                                } else if (messageValue === 0x7f) {
                                    // GS mode off
                                    SpessaSynthInfo(
                                        "%cGS system off, switching to GM",
                                        consoleColors.info
                                    );
                                    this.resetAllControllers("gm");
                                }
                                break;
                            }

                            case 0x06: {
                                // Roland master pan
                                SpessaSynthInfo(
                                    `%cRoland GS Master Pan set to: %c${messageValue}%c with: %c${arrayToHexString(
                                        syx
                                    )}`,
                                    consoleColors.info,
                                    consoleColors.value,
                                    consoleColors.info,
                                    consoleColors.value
                                );
                                this.setMasterParameter(
                                    "masterPan",
                                    (messageValue - 64) / 64
                                );
                                break;
                            }

                            case 0x04: {
                                // Roland GS master volume
                                SpessaSynthInfo(
                                    `%cRoland GS Master Volume set to: %c${messageValue}%c with: %c${arrayToHexString(
                                        syx
                                    )}`,
                                    consoleColors.info,
                                    consoleColors.value,
                                    consoleColors.info,
                                    consoleColors.value
                                );
                                this.setMIDIVolume(messageValue / 127);
                                break;
                            }

                            case 0x05: {
                                // Roland master key shift (transpose)
                                const transpose = messageValue - 64;
                                SpessaSynthInfo(
                                    `%cRoland GS Master Key-Shift set to: %c${transpose}%c with: %c${arrayToHexString(
                                        syx
                                    )}`,
                                    consoleColors.info,
                                    consoleColors.value,
                                    consoleColors.info,
                                    consoleColors.value
                                );
                                this.setMasterTuning(transpose * 100);
                                break;
                            }
                        }
                        return;
                    } else if (syx[5] === 0x01) {
                        // This is a global system parameter also
                        switch (syx[6]) {
                            default: {
                                sysExNotRecognized(syx, "Roland GS");
                                break;
                            }

                            case 0x00: {
                                // Patch name. cool!
                                // Not sure what to do with it, but let's log it!
                                const patchName = readBinaryString(syx, 16, 7);
                                SpessaSynthInfo(
                                    `%cGS Patch name: %c${patchName}`,
                                    consoleColors.info,
                                    consoleColors.value
                                );
                                break;
                            }

                            case 0x33: {
                                // Reverb level
                                SpessaSynthInfo(
                                    `%cGS Reverb level: %c${messageValue}`,
                                    consoleColors.info,
                                    consoleColors.value
                                );
                                this.reverbProcessor.level = messageValue;
                                break;
                            }

                            // Unsupported reverb params
                            case 0x30:
                            case 0x31:
                            case 0x32:
                            case 0x34:
                            case 0x35:
                            case 0x37: {
                                SpessaSynthInfo(
                                    `%cUnsupported GS Reverb Parameter: %c${syx[6].toString(16)}`,
                                    consoleColors.warn,
                                    consoleColors.unrecognized
                                );
                                break;
                            }

                            case 0x3a: {
                                // Chorus level
                                SpessaSynthInfo(
                                    `%cGS Chorus level: %c${messageValue}`,
                                    consoleColors.info,
                                    consoleColors.value
                                );
                                this.chorusProcessor.level = messageValue;
                                break;
                            }

                            // Unsupported chorus params
                            case 0x38:
                            case 0x39:
                            case 0x3b:
                            case 0x3c:
                            case 0x3d:
                            case 0x3e:
                            case 0x3f:
                            case 0x40: {
                                SpessaSynthInfo(
                                    `%cUnsupported GS Chorus Parameter: %c${syx[6].toString(16)}`,
                                    consoleColors.warn,
                                    consoleColors.unrecognized
                                );
                                break;
                            }
                        }
                    }
                } else {
                    // This is some other GS sysex...
                    sysExNotRecognized(syx, "Roland GS");
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
                        sysExNotRecognized(syx, "Roland GS");
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
                        `%cRoland Master Volume control set to: %c${syx[7]}%c via: %c${arrayToHexString(
                            syx
                        )}`,
                        consoleColors.info,
                        consoleColors.value,
                        consoleColors.info,
                        consoleColors.value
                    );
                    return;
                }
            }
        }
    } else {
        // This is something else...
        sysExNotRecognized(syx, "Roland GS");
        return;
    }
}
