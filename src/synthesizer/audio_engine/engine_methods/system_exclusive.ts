import { arrayToHexString, consoleColors } from "../../../utils/other";
import { SpessaSynthInfo, SpessaSynthWarn } from "../../../utils/loggin";
import { ALL_CHANNELS_OR_DIFFERENT_ACTION } from "../engine_components/synth_constants";
import { BankSelectHacks } from "../../../utils/midi_hacks";
import { readBinaryString } from "../../../utils/byte_functions/string";
import { NON_CC_INDEX_OFFSET } from "../engine_components/controller_tables";
import { generatorTypes, type ModulatorSourceEnum, modulatorSources } from "../../../soundbank/enums";
import type { SpessaSynthProcessor } from "../../processor";
import type { IndexedByteArray } from "../../../utils/indexed_array";
import { midiControllers } from "../../../midi/enums";
import { customControllers } from "../../enums";

/**
 * Calculates frequency for MIDI Tuning Standard.
 * @param byte1 The first byte (midi note).
 * @param byte2 The second byte (most significant bits).
 * @param byte3 The third byte (the least significant bits).
 * @return An object containing the MIDI note and the cent tuning value.
 */
function getTuning(
    byte1: number,
    byte2: number,
    byte3: number
): { midiNote: number; centTuning: number | null } {
    const midiNote = byte1;
    const fraction = (byte2 << 7) | byte3; // Combine byte2 and byte3 into a 14-bit number

    // No change
    if (byte1 === 0x7f && byte2 === 0x7f && byte3 === 0x7f) {
        return { midiNote: -1, centTuning: null };
    }

    // Calculate cent tuning
    return { midiNote: midiNote, centTuning: fraction * 0.0061 };
}

type TypedArray =
    | Uint8Array
    | Int8Array
    | Uint16Array
    | Int16Array
    | Uint32Array
    | Int32Array
    | Uint8ClampedArray
    | Float32Array
    | Float64Array;

/**
 * Executes a system exclusive message for the synthesizer.
 * @param syx The system exclusive message as an array of bytes.
 * @param channelOffset The channel offset to apply (default is 0).
 * @remarks
 * This is a rather extensive method that handles various system exclusive messages,
 * including Roland GS, MIDI Tuning Standard, and other non-realtime messages.
 */
export function systemExclusiveInternal(
    this: SpessaSynthProcessor,
    syx: number[] | IndexedByteArray | TypedArray,
    channelOffset = 0
) {
    const manufacturer = syx[0];
    // Ensure that the device ID matches
    if (
        this.privateProps.masterParameters.deviceID !==
            ALL_CHANNELS_OR_DIFFERENT_ACTION &&
        syx[1] !== 0x7f
    ) {
        if (this.privateProps.masterParameters.deviceID !== syx[1]) {
            // Not our device ID
            return;
        }
    }

    // A helper function to log nicely
    function niceLogging(
        channel: number,
        value: number | string,
        what: string,
        units: string
    ) {
        SpessaSynthInfo(
            `%cChannel %c${channel}%c ${what}. %c${value} ${units}%c, with %c${arrayToHexString(syx)}`,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            consoleColors.value,
            consoleColors.info,
            consoleColors.value
        );
    }

    switch (manufacturer) {
        default:
            SpessaSynthInfo(
                `%cUnrecognized SysEx: %c${arrayToHexString(syx)}`,
                consoleColors.warn,
                consoleColors.unrecognized
            );
            break;

        // Non realtime GM
        case 0x7e:
        // Realtime GM
        case 0x7f:
            switch (syx[2]) {
                case 0x04: {
                    let cents;
                    // Device control
                    switch (syx[3]) {
                        case 0x01: {
                            // Main volume
                            const vol = (syx[5] << 7) | syx[4];
                            this.setMIDIVolume(vol / 16384);
                            SpessaSynthInfo(
                                `%cMaster Volume. Volume: %c${vol}`,
                                consoleColors.info,
                                consoleColors.value
                            );
                            break;
                        }

                        case 0x02: {
                            // Main balance
                            // Midi spec page 62
                            const balance = (syx[5] << 7) | syx[4];
                            const pan = (balance - 8192) / 8192;
                            this.setMasterParameter("masterPan", pan);
                            SpessaSynthInfo(
                                `%cMaster Pan. Pan: %c${pan}`,
                                consoleColors.info,
                                consoleColors.value
                            );
                            break;
                        }

                        case 0x03: {
                            // Fine-tuning
                            const tuningValue = ((syx[5] << 7) | syx[6]) - 8192;
                            cents = Math.floor(tuningValue / 81.92); // [-100;+99] cents range
                            this.setMasterTuning(cents);
                            SpessaSynthInfo(
                                `%cMaster Fine Tuning. Cents: %c${cents}`,
                                consoleColors.info,
                                consoleColors.value
                            );
                            break;
                        }

                        case 0x04: {
                            // Coarse tuning
                            // Lsb is ignored
                            const semitones = syx[5] - 64;
                            cents = semitones * 100;
                            this.setMasterTuning(cents);
                            SpessaSynthInfo(
                                `%cMaster Coarse Tuning. Cents: %c${cents}`,
                                consoleColors.info,
                                consoleColors.value
                            );
                            break;
                        }

                        default:
                            SpessaSynthInfo(
                                `%cUnrecognized MIDI Device Control Real-time message: %c${arrayToHexString(syx)}`,
                                consoleColors.warn,
                                consoleColors.unrecognized
                            );
                    }
                    break;
                }

                case 0x09:
                    // Gm system related
                    if (syx[3] === 0x01) {
                        SpessaSynthInfo("%cGM1 system on", consoleColors.info);
                        this.resetAllControllers("gm");
                    } else if (syx[3] === 0x03) {
                        SpessaSynthInfo("%cGM2 system on", consoleColors.info);
                        this.resetAllControllers("gm2");
                    } else {
                        SpessaSynthInfo(
                            "%cGM system off, defaulting to GS",
                            consoleColors.info
                        );
                        this.setMasterParameter("midiSystem", "gs");
                    }
                    break;

                // MIDI Tuning standard
                // https://midi.org/midi-tuning-updated-specification
                case 0x08: {
                    let currentMessageIndex = 4;
                    switch (syx[3]) {
                        // Bulk tuning dump: all 128 notes
                        case 0x01: {
                            const program = syx[currentMessageIndex++];
                            // Read the name
                            const tuningName = readBinaryString(
                                syx,
                                16,
                                currentMessageIndex
                            );
                            currentMessageIndex += 16;
                            if (syx.length < 384) {
                                SpessaSynthWarn(
                                    `The Bulk Tuning Dump is too short! (${syx.length} bytes, at least 384 are expected)`
                                );
                                return;
                            }
                            // 128 frequencies follow
                            for (let i = 0; i < 128; i++) {
                                // Set the given tuning to the program
                                this.privateProps.tunings[program][i] =
                                    getTuning(
                                        syx[currentMessageIndex++],
                                        syx[currentMessageIndex++],
                                        syx[currentMessageIndex++]
                                    );
                            }
                            SpessaSynthInfo(
                                `%cBulk Tuning Dump %c${tuningName}%c Program: %c${program}`,
                                consoleColors.info,
                                consoleColors.value,
                                consoleColors.info,
                                consoleColors.recognized
                            );
                            break;
                        }

                        // Single note change
                        // Single note change bank
                        case 0x02:
                        case 0x07: {
                            if (syx[3] === 0x07) {
                                // Skip the bank
                                currentMessageIndex++;
                            }
                            // Get program and number of changes
                            const tuningProgram = syx[currentMessageIndex++];
                            const numberOfChanges = syx[currentMessageIndex++];
                            for (let i = 0; i < numberOfChanges; i++) {
                                // Set the given tuning to the program
                                this.privateProps.tunings[tuningProgram][
                                    syx[currentMessageIndex++]
                                ] = getTuning(
                                    syx[currentMessageIndex++],
                                    syx[currentMessageIndex++],
                                    syx[currentMessageIndex++]
                                );
                            }
                            SpessaSynthInfo(
                                `%cSingle Note Tuning. Program: %c${tuningProgram}%c Keys affected: %c${numberOfChanges}`,
                                consoleColors.info,
                                consoleColors.recognized,
                                consoleColors.info,
                                consoleColors.recognized
                            );
                            break;
                        }

                        // Octave tuning (1 byte)
                        // And octave tuning (2 bytes)
                        case 0x09:
                        case 0x08: {
                            // Get tuning:
                            const newOctaveTuning = new Int8Array(12);
                            // Start from bit 7
                            if (syx[3] === 0x08) {
                                // 1 byte tuning: 0 is -64 cents, 64 is 0, 127 is +63
                                for (let i = 0; i < 12; i++) {
                                    newOctaveTuning[i] = syx[7 + i] - 64;
                                }
                            } else {
                                // 2 byte tuning. Like fine tune: 0 is -100 cents, 8192 is 0 cents, 16,383 is +100 cents
                                for (let i = 0; i < 24; i += 2) {
                                    const tuning =
                                        ((syx[7 + i] << 7) | syx[8 + i]) - 8192;
                                    newOctaveTuning[i / 2] = Math.floor(
                                        tuning / 81.92
                                    ); // Map to [-100;+99] cents
                                }
                            }
                            // Apply to channels (ordered from 0)
                            // Bit 1: 14 and 15
                            if ((syx[4] & 1) === 1) {
                                this.midiChannels[
                                    14 + channelOffset
                                ].setOctaveTuning(newOctaveTuning);
                            }
                            if (((syx[4] >> 1) & 1) === 1) {
                                this.midiChannels[
                                    15 + channelOffset
                                ].setOctaveTuning(newOctaveTuning);
                            }

                            // Bit 2: channels 7 to 13
                            for (let i = 0; i < 7; i++) {
                                const bit = (syx[5] >> i) & 1;
                                if (bit === 1) {
                                    this.midiChannels[
                                        7 + i + channelOffset
                                    ].setOctaveTuning(newOctaveTuning);
                                }
                            }

                            // Bit 3: channels 0 to 16
                            for (let i = 0; i < 7; i++) {
                                const bit = (syx[6] >> i) & 1;
                                if (bit === 1) {
                                    this.midiChannels[
                                        i + channelOffset
                                    ].setOctaveTuning(newOctaveTuning);
                                }
                            }

                            SpessaSynthInfo(
                                `%cMIDI Octave Scale ${
                                    syx[3] === 0x08 ? "(1 byte)" : "(2 bytes)"
                                } tuning via Tuning: %c${newOctaveTuning.join(" ")}`,
                                consoleColors.info,
                                consoleColors.value
                            );
                            break;
                        }

                        default:
                            SpessaSynthInfo(
                                `%cUnrecognized MIDI Tuning standard message: %c${arrayToHexString(syx)}`,
                                consoleColors.warn,
                                consoleColors.unrecognized
                            );
                            break;
                    }
                    break;
                }

                default:
                    SpessaSynthInfo(
                        `%cUnrecognized MIDI Realtime/non realtime message: %c${arrayToHexString(syx)}`,
                        consoleColors.warn,
                        consoleColors.unrecognized
                    );
            }
            break;

        // This is a roland sysex
        // http://www.bandtrax.com.au/sysex.htm
        // https://cdn.roland.com/assets/media/pdf/AT-20R_30R_MI.pdf
        case 0x41:
            // 0x12: DT1 (Device Transmit)
            if (syx[3] === 0x12) {
                function notRecognized() {
                    // This is some other GS sysex...
                    SpessaSynthInfo(
                        `%cUnrecognized Roland %cGS %cSysEx: %c${arrayToHexString(syx)}`,
                        consoleColors.warn,
                        consoleColors.recognized,
                        consoleColors.warn,
                        consoleColors.unrecognized
                    );
                }
                // Model ID
                switch (syx[2]) {
                    case 0x42: {
                        // This is a GS sysex

                        const messageValue = syx[7];
                        // Syx[5] and [6] is the system parameter, syx[7] is the value
                        // Either patch common or SC-88 mode set
                        if (
                            syx[4] === 0x40 ||
                            (syx[4] === 0x00 && syx[6] === 0x7f)
                        ) {
                            // This is a channel parameter
                            if ((syx[5] & 0x10) > 0) {
                                // This is an individual part (channel) parameter
                                // Determine the channel 0 means channel 10 (default), 1 means 1 etc.
                                // SC-88Pro manual page 196
                                const channel =
                                    [
                                        9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11,
                                        12, 13, 14, 15
                                    ][syx[5] & 0x0f] + channelOffset;
                                // For example, 0x1A means A = 11, which corresponds to channel 12 (counting from 1)
                                const channelObject =
                                    this.midiChannels[channel];
                                switch (syx[6]) {
                                    default:
                                        // This is some other GS sysex...
                                        notRecognized();
                                        break;

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
                                        niceLogging(
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
                                    case 0x21:
                                        channelObject.controllerChange(
                                            midiControllers.chorusDepth,
                                            messageValue
                                        );
                                        break;

                                    // Reverb send
                                    case 0x22:
                                        channelObject.controllerChange(
                                            midiControllers.reverbDepth,
                                            messageValue
                                        );
                                        break;

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
                                        channelObject.setOctaveTuning(
                                            newTuning
                                        );
                                        const cents = messageValue - 64;
                                        niceLogging(
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
                                        9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11,
                                        12, 13, 14, 15
                                    ][syx[5] & 0x0f] + channelOffset;
                                // For example, 0x1A means A = 11, which corresponds to channel 12 (counting from 1)
                                const channelObject =
                                    this.midiChannels[channel];
                                const centeredValue = messageValue - 64;
                                const normalizedValue = centeredValue / 64;
                                const normalizedNotCentered =
                                    messageValue / 128;

                                // Setup receivers for cc to parameter (sc-88 manual page 198)
                                const setupReceivers = (
                                    source: number,
                                    sourceName: string,
                                    bipolar = false
                                ) => {
                                    switch (syx[6] & 0x0f) {
                                        case 0x00:
                                            // See https://github.com/spessasus/SpessaSynth/issues/154
                                            // Pitch control
                                            // Special case:
                                            // If the source is a pitch wheel, it's a strange way of setting the bend range
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
                                                niceLogging(
                                                    channel,
                                                    centeredValue,
                                                    `${sourceName} pitch control`,
                                                    "semitones"
                                                );
                                            }
                                            break;

                                        case 0x01:
                                            // Cutoff
                                            channelObject.sysExModulators.setModulator(
                                                source as ModulatorSourceEnum,
                                                generatorTypes.initialFilterFc,
                                                normalizedValue * 9600,
                                                bipolar
                                            );
                                            niceLogging(
                                                channel,
                                                normalizedValue * 9600,
                                                `${sourceName} pitch control`,
                                                "cents"
                                            );
                                            break;

                                        case 0x02:
                                            // Amplitude
                                            channelObject.sysExModulators.setModulator(
                                                source as ModulatorSourceEnum,
                                                generatorTypes.initialAttenuation,
                                                normalizedValue * 960, // Spec says "100%" so 960cB in sf2
                                                bipolar
                                            );
                                            niceLogging(
                                                channel,
                                                normalizedValue * 960,
                                                `${sourceName} amplitude`,
                                                "cB"
                                            );
                                            break;

                                        // Rate control is ignored as it is in hertz

                                        case 0x04:
                                            // LFO1 pitch depth
                                            channelObject.sysExModulators.setModulator(
                                                source as ModulatorSourceEnum,
                                                generatorTypes.vibLfoToPitch,
                                                normalizedNotCentered * 600,
                                                bipolar
                                            );
                                            niceLogging(
                                                channel,
                                                normalizedNotCentered * 600,
                                                `${sourceName} LFO1 pitch depth`,
                                                "cents"
                                            );
                                            break;

                                        case 0x05:
                                            // LFO1 filter depth
                                            channelObject.sysExModulators.setModulator(
                                                source as ModulatorSourceEnum,
                                                generatorTypes.vibLfoToFilterFc,
                                                normalizedNotCentered * 2400,
                                                bipolar
                                            );
                                            niceLogging(
                                                channel,
                                                normalizedNotCentered * 2400,
                                                `${sourceName} LFO1 filter depth`,
                                                "cents"
                                            );
                                            break;

                                        case 0x06:
                                            // LFO1 amplitude depth
                                            channelObject.sysExModulators.setModulator(
                                                source as ModulatorSourceEnum,
                                                generatorTypes.vibLfoToVolume,
                                                normalizedValue * 960,
                                                bipolar
                                            );
                                            niceLogging(
                                                channel,
                                                normalizedValue * 960,
                                                `${sourceName} LFO1 amplitude depth`,
                                                "cB"
                                            );
                                            break;

                                        // Rate control is ignored as it is in hertz

                                        case 0x08:
                                            // LFO2 pitch depth
                                            channelObject.sysExModulators.setModulator(
                                                source as ModulatorSourceEnum,
                                                generatorTypes.modLfoToPitch,
                                                normalizedNotCentered * 600,
                                                bipolar
                                            );
                                            niceLogging(
                                                channel,
                                                normalizedNotCentered * 600,
                                                `${sourceName} LFO2 pitch depth`,
                                                "cents"
                                            );
                                            break;

                                        case 0x09:
                                            // LFO2 filter depth
                                            channelObject.sysExModulators.setModulator(
                                                source as ModulatorSourceEnum,
                                                generatorTypes.modLfoToFilterFc,
                                                normalizedNotCentered * 2400,
                                                bipolar
                                            );
                                            niceLogging(
                                                channel,
                                                normalizedNotCentered * 2400,
                                                `${sourceName} LFO2 filter depth`,
                                                "cents"
                                            );
                                            break;

                                        case 0x0a:
                                            // LFO2 amplitude depth
                                            channelObject.sysExModulators.setModulator(
                                                source as ModulatorSourceEnum,
                                                generatorTypes.modLfoToVolume,
                                                normalizedValue * 960,
                                                bipolar
                                            );
                                            niceLogging(
                                                channel,
                                                normalizedValue * 960,
                                                `${sourceName} LFO2 amplitude depth`,
                                                "cB"
                                            );
                                            break;
                                    }
                                };

                                // SC88 manual page 198
                                switch (syx[6] & 0xf0) {
                                    default:
                                        // This is some other GS sysex...
                                        notRecognized();
                                        break;

                                    case 0x00:
                                        // Modulation wheel
                                        setupReceivers(
                                            midiControllers.modulationWheel,
                                            "mod wheel"
                                        );
                                        break;

                                    case 0x10:
                                        // Pitch bend
                                        setupReceivers(
                                            NON_CC_INDEX_OFFSET +
                                                modulatorSources.pitchWheel,
                                            "pitch wheel",
                                            true
                                        );
                                        break;

                                    case 0x20:
                                        // Channel pressure
                                        setupReceivers(
                                            NON_CC_INDEX_OFFSET +
                                                modulatorSources.channelPressure,
                                            "channel pressure"
                                        );
                                        break;

                                    case 0x30:
                                        // Poly pressure
                                        setupReceivers(
                                            NON_CC_INDEX_OFFSET +
                                                modulatorSources.polyPressure,
                                            "poly pressure"
                                        );
                                        break;
                                }
                                return;
                            } else if (syx[5] === 0x00) {
                                // This is a global system parameter
                                switch (syx[6]) {
                                    default:
                                        notRecognized();
                                        break;

                                    case 0x7f:
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

                                    case 0x06:
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

                                    case 0x04:
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
                                    default:
                                        notRecognized();
                                        break;

                                    case 0x00: {
                                        // Patch name. cool!
                                        // Not sure what to do with it, but let's log it!
                                        const patchName = readBinaryString(
                                            syx,
                                            16,
                                            7
                                        );
                                        SpessaSynthInfo(
                                            `%cGS Patch name: %c${patchName}`,
                                            consoleColors.info,
                                            consoleColors.value
                                        );
                                        break;
                                    }

                                    case 0x33:
                                        // Reverb level
                                        SpessaSynthInfo(
                                            `%cGS Reverb level: %c${messageValue}`,
                                            consoleColors.info,
                                            consoleColors.value
                                        );
                                        // 64 is the default
                                        this.privateProps.reverbSend =
                                            messageValue / 64;
                                        break;

                                    // Unsupported reverb params
                                    case 0x30:
                                    case 0x31:
                                    case 0x32:
                                    case 0x34:
                                    case 0x35:
                                    case 0x37:
                                        SpessaSynthInfo(
                                            `%cUnsupported GS Reverb Parameter: %c${syx[6].toString(16)}`,
                                            consoleColors.warn,
                                            consoleColors.unrecognized
                                        );
                                        break;

                                    case 0x3a:
                                        // Chorus level
                                        SpessaSynthInfo(
                                            `%cGS Chorus level: %c${messageValue}`,
                                            consoleColors.info,
                                            consoleColors.value
                                        );
                                        // 64 is the default
                                        this.privateProps.chorusSend =
                                            messageValue / 64;
                                        break;

                                    // Unsupported chorus params
                                    case 0x38:
                                    case 0x39:
                                    case 0x3b:
                                    case 0x3c:
                                    case 0x3d:
                                    case 0x3e:
                                    case 0x3f:
                                    case 0x40:
                                        SpessaSynthInfo(
                                            `%cUnsupported GS Chorus Parameter: %c${syx[6].toString(16)}`,
                                            consoleColors.warn,
                                            consoleColors.unrecognized
                                        );
                                        break;
                                }
                            }
                        } else {
                            // This is some other GS sysex...
                            notRecognized();
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
                                this.privateProps.callEvent(
                                    "synthDisplay",
                                    Array.from(syx)
                                );
                            } else if (syx[5] === 0x01) {
                                // Matrix display
                                this.privateProps.callEvent(
                                    "synthDisplay",
                                    Array.from(syx)
                                );
                            } else {
                                // This is some other GS sysex...
                                notRecognized();
                            }
                        }
                        return;
                    }

                    case 0x16:
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
            } else {
                // This is something else...
                SpessaSynthInfo(
                    `%cUnrecognized Roland SysEx: %c${arrayToHexString(syx)}`,
                    consoleColors.warn,
                    consoleColors.unrecognized
                );
                return;
            }
            break;

        // Yamaha
        // http://www.studio4all.de/htmle/main91.html
        case 0x43:
            // XG sysex
            if (syx[2] === 0x4c) {
                // XG system parameter
                if (syx[3] === 0x00 && syx[4] === 0x00) {
                    switch (syx[5]) {
                        // Master tune
                        case 0x00:
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
                        case 0x7e:
                            SpessaSynthInfo(
                                "%cXG system on",
                                consoleColors.info
                            );
                            this.resetAllControllers("xg");
                            break;
                    }
                } else if (syx[3] === 0x08) {
                    // XG part parameter
                    if (
                        !BankSelectHacks.isSystemXG(
                            this.privateProps.masterParameters.midiSystem
                        )
                    ) {
                        return;
                    }
                    const channel = syx[4] + channelOffset;
                    if (channel >= this.midiChannels.length) {
                        // Invalid channel
                        return;
                    }
                    const channelObject = this.midiChannels[channel];
                    const value = syx[6];
                    switch (syx[5]) {
                        // Bank-select MSB
                        case 0x01:
                            channelObject.controllerChange(
                                midiControllers.bankSelect,
                                value
                            );
                            break;

                        // Bank-select LSB
                        case 0x02:
                            channelObject.controllerChange(
                                midiControllers.bankSelectLSB,
                                value
                            );
                            break;

                        // Program change
                        case 0x03:
                            channelObject.programChange(value);
                            break;

                        // Note shift
                        case 0x08: {
                            if (channelObject.drumChannel) {
                                return;
                            }
                            channelObject.channelTransposeKeyShift = value - 64;
                            break;
                        }

                        // Volume
                        case 0x0b:
                            channelObject.controllerChange(
                                midiControllers.mainVolume,
                                value
                            );
                            break;

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

                        // Reverb
                        case 0x13:
                            channelObject.controllerChange(
                                midiControllers.reverbDepth,
                                value
                            );
                            break;

                        // Chorus
                        case 0x12:
                            channelObject.controllerChange(
                                midiControllers.chorusDepth,
                                value
                            );
                            break;

                        // Filter cutoff
                        case 0x18:
                            channelObject.controllerChange(
                                midiControllers.brightness,
                                value
                            );
                            break;

                        // Filter resonance
                        case 0x19:
                            channelObject.controllerChange(
                                midiControllers.filterResonance,
                                value
                            );
                            break;

                        // Attack time
                        case 0x1a:
                            channelObject.controllerChange(
                                midiControllers.attackTime,
                                value
                            );
                            break;

                        // Decay time
                        case 0x1b:
                            channelObject.controllerChange(
                                midiControllers.decayTime,
                                value
                            );
                            break;

                        // Release time
                        case 0x1c:
                            channelObject.controllerChange(
                                midiControllers.releaseTime,
                                value
                            );
                            break;

                        default:
                            SpessaSynthInfo(
                                `%cUnrecognized Yamaha XG Part Setup: %c${syx[5]
                                    .toString(16)
                                    .toUpperCase()}`,
                                consoleColors.warn,
                                consoleColors.unrecognized
                            );
                    }
                } else if (
                    syx[3] === 0x06 && // XG System parameter
                    syx[4] === 0x00 // System Byte
                ) {
                    // Displayed letters
                    this.privateProps.callEvent(
                        "synthDisplay",
                        Array.from(syx)
                    );
                } else if (
                    BankSelectHacks.isSystemXG(
                        this.privateProps.masterParameters.midiSystem
                    )
                ) {
                    SpessaSynthInfo(
                        `%cUnrecognized Yamaha XG SysEx: %c${arrayToHexString(syx)}`,
                        consoleColors.warn,
                        consoleColors.unrecognized
                    );
                }
            } else {
                if (
                    BankSelectHacks.isSystemXG(
                        this.privateProps.masterParameters.midiSystem
                    )
                ) {
                    SpessaSynthInfo(
                        `%cUnrecognized Yamaha SysEx: %c${arrayToHexString(syx)}`,
                        consoleColors.warn,
                        consoleColors.unrecognized
                    );
                }
            }
            break;
    }
}
