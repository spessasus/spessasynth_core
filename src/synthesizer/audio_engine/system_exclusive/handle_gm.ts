import { SpessaLog } from "../../../utils/loggin";
import { readBinaryString } from "../../../utils/byte_functions/string";
import type { SynthesizerCore } from "../synthesizer_core";
import type { SysExAcceptedArray } from "../../../midi/types";

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
    this: SynthesizerCore,
    syx: SysExAcceptedArray,
    channelOffset = 0
) {
    switch (syx[2]) {
        // Device control
        case 0x04: {
            switch (syx[3]) {
                default: {
                    SpessaLog.gmFail("Device Control", syx);
                    break;
                }

                case 0x01: {
                    // Master volume
                    const vol = (syx[5] << 7) | syx[4];
                    this.setMIDIParameter("masterVolume", vol / 16_384);
                    SpessaLog.gmInfo("Master Volume", vol);
                    break;
                }

                case 0x02: {
                    // Master balance
                    // Complete MIDI 1.0 Detailed Specification page 57
                    // This is not specified in GM2 spec for some reason
                    const balance = (syx[5] << 7) | syx[4];
                    const pan = (balance - 8192) / 8192;
                    this.setMIDIParameter("masterPan", pan);
                    SpessaLog.gmInfo("Master Balance", pan);
                    break;
                }

                case 0x03: {
                    // Fine-tuning
                    const tuningValue = ((syx[5] << 7) | syx[6]) - 8192;
                    const cents = Math.floor(tuningValue / 81.92); // [-100;+99] cents range
                    this.setMIDIParameter("fineTune", cents);
                    SpessaLog.gmInfo("Master Fine Tuning", cents, "cents");
                    break;
                }

                case 0x04: {
                    // Coarse tuning
                    // Lsb is ignored
                    const keyShift = syx[5] - 64;
                    this.setMIDIParameter("keyShift", keyShift);
                    SpessaLog.gmInfo("Master Coarse Tuning", keyShift, "keys");
                    break;
                }

                case 0x05: {
                    // Global Parameter control
                    if (
                        syx[4] !== 0x01 || // Slot Path Length
                        syx[5] !== 0x01 || // Parameter ID Width
                        syx[6] !== 0x01 || // Value Width
                        syx[7] !== 0x01 // Slot Path MSB
                    ) {
                        SpessaLog.gmFail("Global Parameter Control", syx);
                        break;
                    }
                    // Slot Path LSB
                    switch (syx[8]) {
                        default: {
                            SpessaLog.gmFail("Global Parameter Control", syx);
                            break;
                        }

                        case 0x01: {
                            // Reverb
                            const value = syx[10];
                            // Parameter
                            switch (syx[9]) {
                                default: {
                                    SpessaLog.gmFail(
                                        "Reverb Parameter Control",
                                        syx
                                    );
                                    break;
                                }

                                case 0x00: {
                                    // Reverb type
                                    // Match 8850 manual, page 231
                                    // All match except for plate which is 8 in GM and 5 in GS
                                    const macro = value === 0x08 ? 0x05 : value;
                                    this.setReverbMacro(macro);
                                    SpessaLog.gmInfo("Reverb Type", macro);
                                    break;
                                }

                                case 0x01: {
                                    // Reverb time
                                    this.reverbProcessor.time = value;
                                    SpessaLog.gmInfo("Reverb Time", value);
                                }
                            }
                            break;
                        }

                        case 0x02: {
                            // Chorus
                            const value = syx[10];
                            // Parameter
                            switch (syx[9]) {
                                default: {
                                    SpessaLog.gmFail(
                                        "Chorus Parameter Control",
                                        syx
                                    );
                                    break;
                                }

                                case 0x00: {
                                    // Chorus type
                                    // Match 8850 manual, page 231
                                    // All match
                                    this.setChorusMacro(value);
                                    SpessaLog.gmInfo("Chorus Type", value);
                                    break;
                                }

                                case 0x01: {
                                    // Mod rate
                                    this.chorusProcessor.rate = value;
                                    SpessaLog.gmInfo("Chorus Mod Rate", value);
                                    break;
                                }

                                case 0x02: {
                                    // Mod depth
                                    this.chorusProcessor.depth = value;
                                    SpessaLog.gmInfo("Chorus Mod Depth", value);
                                    break;
                                }

                                case 0x03: {
                                    // Mod feedback
                                    this.chorusProcessor.feedback = value;
                                    SpessaLog.gmInfo(
                                        "Chorus Mod Feedback",
                                        value
                                    );
                                    break;
                                }

                                case 0x04: {
                                    // Mod send to reverb
                                    this.chorusProcessor.sendLevelToReverb =
                                        value;
                                    SpessaLog.gmInfo(
                                        "Chorus Send to Reverb",
                                        value
                                    );
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            break;
        }

        // General MIDI
        case 0x09: {
            switch (syx[3]) {
                default: {
                    SpessaLog.gmFail("System Exclusive", syx);
                    break;
                }

                case 0x01: {
                    SpessaLog.coolInfo("MIDI System", "General MIDI 1");
                    this.reset("gm");
                    break;
                }

                case 0x02: {
                    SpessaLog.coolInfo("MIDI System", "Roland GS");
                    this.reset("gs");
                    break;
                }

                case 0x03: {
                    SpessaLog.coolInfo("MIDI System", "General MIDI 2");
                    this.reset("gm2");
                    break;
                }
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
                        SpessaLog.warn(
                            `The Bulk Tuning Dump is too short! (${syx.length} bytes, at least 384 are expected)`
                        );
                        return;
                    }
                    // 128 frequencies follow
                    for (let midiNote = 0; midiNote < 128; midiNote++) {
                        // Set the given tuning to the program
                        this.tunings[program * 128 + midiNote] = getTuning(
                            syx[currentMessageIndex++],
                            syx[currentMessageIndex++],
                            syx[currentMessageIndex++]
                        );
                    }
                    SpessaLog.gmInfo(
                        "Bulk Tuning Dump",
                        `${tuningName}, program ${program}`
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
                        this.tunings[tuningProgram * 128 + midiNote] =
                            getTuning(
                                syx[currentMessageIndex++],
                                syx[currentMessageIndex++],
                                syx[currentMessageIndex++]
                            );
                    }
                    SpessaLog.gmInfo(
                        "Single Note Tuning",
                        `program: ${tuningProgram}. Keys affected: ${numberOfChanges}`
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

                    SpessaLog.gmInfo(
                        "Octave Scale Tuning",
                        newOctaveTuning.join(" ")
                    );
                    break;
                }

                default: {
                    SpessaLog.gmFail("MIDI Tuning Standard", syx);
                    break;
                }
            }
            break;
        }

        default: {
            SpessaLog.gmFail("Universal System Exclusive", syx);
        }
    }
}
