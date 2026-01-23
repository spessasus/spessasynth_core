import type { SpessaSynthProcessor } from "../../../processor";
import { type SysExAcceptedArray, sysExNotRecognized } from "./helpers";
import { SpessaSynthInfo, SpessaSynthWarn } from "../../../../utils/loggin";
import { arrayToHexString, consoleColors } from "../../../../utils/other";
import { readBinaryString } from "../../../../utils/byte_functions/string";

/**
 * Calculates frequency for MIDI Tuning Standard.
 * @param byte1 The first byte (midi note).
 * @param byte2 The second byte (most significant bits).
 * @param byte3 The third byte (the least significant bits).
 * @return An object containing the MIDI note and the cent tuning value.
 */
function getTuning(byte1: number, byte2: number, byte3: number): number {
    const midiNote = byte1;
    const fraction = (byte2 << 7) | byte3; // Combine byte2 and byte3 into a 14-bit number

    // No change
    if (byte1 === 0x7f && byte2 === 0x7f && byte3 === 0x7f) {
        return -1;
    }

    // Calculate cent tuning (divide cents by 100 so it works in semitones)
    return midiNote + fraction * 0.000_061;
}

/**
 * Handles a GM system exclusive (realtime/non-realtime)
 * @param syx
 * @param channelOffset
 */
export function handleGM(
    this: SpessaSynthProcessor,
    syx: SysExAcceptedArray,
    channelOffset = 0
) {
    switch (syx[2]) {
        case 0x04: {
            let cents;
            // Device control
            switch (syx[3]) {
                case 0x01: {
                    // Main volume
                    const vol = (syx[5] << 7) | syx[4];
                    this.setMIDIVolume(vol / 16_384);
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

                default: {
                    SpessaSynthInfo(
                        `%cUnrecognized MIDI Device Control Real-time message: %c${arrayToHexString(syx)}`,
                        consoleColors.warn,
                        consoleColors.unrecognized
                    );
                }
            }
            break;
        }

        case 0x09: {
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
        }

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
                    for (let midiNote = 0; midiNote < 128; midiNote++) {
                        // Set the given tuning to the program
                        this.privateProps.tunings[program * 128 + midiNote] =
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
                        const midiNote = syx[currentMessageIndex++];
                        // Set the given tuning to the program
                        this.privateProps.tunings[
                            tuningProgram * 128 + midiNote
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
                            newOctaveTuning[i / 2] = Math.floor(tuning / 81.92); // Map to [-100;+99] cents
                        }
                    }
                    // Apply to channels (ordered from 0)
                    // Bit 1: 14 and 15
                    if ((syx[4] & 1) === 1) {
                        this.midiChannels[14 + channelOffset].setOctaveTuning(
                            newOctaveTuning
                        );
                    }
                    if (((syx[4] >> 1) & 1) === 1) {
                        this.midiChannels[15 + channelOffset].setOctaveTuning(
                            newOctaveTuning
                        );
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

                default: {
                    sysExNotRecognized(syx, "MIDI Tuning Standard");
                    break;
                }
            }
            break;
        }

        default: {
            sysExNotRecognized(syx, "General MIDI");
        }
    }
}
