import { MIDIMessage } from "../midi_message";
import {
    type MIDIController,
    MIDIControllers,
    MIDIMessageTypes,
    NonRegisteredLSB,
    NonRegisteredMSB,
    RegisteredParameterTypes
} from "../enums";

import type { SysExAcceptedArray } from "../types";

export type AnalyzedMIDIMessage =
    | { type: "Other" }
    | { type: "XG Reset" }
    | { type: "GM On" }
    | { type: "GM Off" }
    | { type: "GM2 On" }
    | { type: "GS Reset" }
    | { type: "Reverb Param" }
    | { type: "Chorus Param" }
    | { type: "Delay Param" }
    | { type: "Variation Param" }
    | { type: "Insertion Param" }
    | { type: "Drums On"; channel: number; isDrum: boolean }
    | { type: "Drum Setup" }
    | { type: "Program Change"; channel: number; value: number }
    | {
          type: "Controller Change";
          controller: MIDIController;
          value: number;
          channel: number;
      }
    | { type: "Master Key Shift"; value: number }
    | { type: "Key Shift"; value: number; channel: number }
    // Value in cents
    | { type: "Master Fine Tune"; value: number }
    // Value in cents
    | { type: "Fine Tune"; value: number; channel: number };

const OTHER = Object.freeze({ type: "Other" }) as AnalyzedMIDIMessage;

/**
 * A general purpose class for handling MIDI messages.
 */
export class MIDIUtils {
    /**
     * Analyzes a MIDI System Exclusive message
     * and returns an identification and data for it.
     * @param syx the System Exclusive message, WITHOUT the first 0xF0 System Exclusive byte!
     */
    public static analyzeSysEx(syx: SysExAcceptedArray): AnalyzedMIDIMessage {
        // At least Manufacturer ID, Device ID and XG/GS model ID
        if (syx.length < 3) return OTHER;
        switch (syx[0]) {
            default: {
                return OTHER;
            }

            // Non realtime GM
            case 0x7e:
            // Realtime GM
            case 0x7f: {
                return this.analyzeGM(syx);
            }

            // Roland
            case 0x41: {
                return this.analyzeGS(syx);
            }

            // Yamaha
            case 0x43: {
                return this.analyzeXG(syx);
            }
        }
    }

    /**
     * Analyzes a MIDI Registered Parameter Number
     * and returns an identification and data for it.
     * @param channel The MIDI channel number.
     * @param rpn The 14-bit RPN number.
     * @param value The 14-bit value for that number.
     */
    public static analyzeRPN(
        channel: number,
        rpn: number,
        value: number
    ): AnalyzedMIDIMessage {
        switch (rpn) {
            default: {
                return OTHER;
            }

            case RegisteredParameterTypes.fineTuning: {
                return {
                    type: "Fine Tune",
                    channel,
                    value: (value - 8192) / 81.92
                };
            }

            case RegisteredParameterTypes.coarseTuning: {
                return {
                    type: "Key Shift",
                    channel,
                    value: (value >> 7) - 64
                };
            }
        }
    }

    /**
     * Analyzes a MIDI Non-Registered Parameter Number
     * and returns an identification and data for it.
     * @param channel The MIDI channel number.
     * @param nrpn The 14-bit NRPN number.
     * @param value The 14-bit value for that number.
     */
    public static analyzeNRPN(
        channel: number,
        nrpn: number,
        value: number
    ): AnalyzedMIDIMessage {
        const msb = nrpn >> 7;
        const lsb = nrpn & 0x7f;
        switch (msb) {
            default: {
                return OTHER;
            }

            case NonRegisteredMSB.partParameter: {
                switch (lsb) {
                    default: {
                        return OTHER;
                    }

                    case NonRegisteredLSB.tvfCutoffFrequency: {
                        return {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.brightness,
                            value: value >> 7
                        };
                    }

                    case NonRegisteredLSB.tvfResonance: {
                        return {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.filterResonance,
                            value: value >> 7
                        };
                    }

                    case NonRegisteredLSB.envelopeAttackTime: {
                        return {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.attackTime,
                            value: value >> 7
                        };
                    }

                    case NonRegisteredLSB.envelopeDecayTime: {
                        return {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.decayTime,
                            value: value >> 7
                        };
                    }

                    case NonRegisteredLSB.envelopeReleaseTime: {
                        return {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.releaseTime,
                            value: value >> 7
                        };
                    }
                }
            }

            case NonRegisteredMSB.drumPitch:
            case NonRegisteredMSB.drumPitchFine:
            case NonRegisteredMSB.drumLevel:
            case NonRegisteredMSB.drumPan:
            case NonRegisteredMSB.drumReverb:
            case NonRegisteredMSB.drumChorus:
            case NonRegisteredMSB.drumDelay: {
                return {
                    type: "Drum Setup"
                };
            }
        }
    }

    /**
     * Converts GS/XG "part number" to MIDI channel number.
     * @param part The part number.
     */
    public static syxToChannel(part: number) {
        return [9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15][
            part % 16
        ];
    }

    /**
     * Converts MIDI channel number to GS/XG "part number".
     * @param channel The MIDI channel number.
     */
    public static channelToSyx(channel: number) {
        return [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 10, 11, 12, 13, 14, 15][
            channel % 16
        ];
    }

    /**
     * Gets raw GS System Exclusive message bytes, without the 0xF0 status byte.
     * @param a1 Address 1
     * @param a2 Address 2
     * @param a3 Address 3
     * @param data Data, can be multiple bytes.
     */
    public static gsData(a1: number, a2: number, a3: number, data: number[]) {
        // Calculate checksum
        // SC 8850 manual, page 245
        const sum = a1 + a2 + a3 + data.reduce((sum, cur) => sum + cur, 0);
        const checksum = (128 - (sum % 128)) & 0x7f;
        return [
            0x41, // Roland
            0x10, // Device ID (defaults to 16 on Roland)
            0x42, // GS
            0x12, // Command ID (DT1)
            a1,
            a2,
            a3,
            ...data,
            checksum,
            0xf7 // End of exclusive
        ];
    }

    /**
     * Gets a GS System Exclusive MIDI message.
     * @param ticks The tick time of the message.
     * @param a1 Address 1
     * @param a2 Address 2
     * @param a3 Address 3
     * @param data Data, can be multiple bytes.
     */
    public static gsMessage(
        ticks: number,
        a1: number,
        a2: number,
        a3: number,
        data: number[]
    ) {
        return new MIDIMessage(
            ticks,
            MIDIMessageTypes.systemExclusive,
            new Uint8Array(this.gsData(a1, a2, a3, data))
        );
    }

    /**
     * Gets a GS reset message System Exclusive MIDI message.
     * @param ticks The tick time of the message.
     * @param channel The MIDI channel number.
     * @param drumMap The drum map to use. 0 turns the channel into a melodic channel,
     * while other values turn it into a drum channel.
     */
    public static gsDrumChange(
        ticks: number,
        channel: number,
        drumMap: 0 | 1 | 2
    ): MIDIMessage {
        const chanAddress = 0x10 | this.channelToSyx(channel);
        return this.gsMessage(ticks, 40, chanAddress, 0x15, [drumMap]);
    }

    /**
     * Gets a GS reset message System Exclusive MIDI message.
     * @param ticks The tick time of the message.
     */
    public static gsReset(ticks: number): MIDIMessage {
        return this.gsMessage(
            ticks,
            0x40, // System parameter - Address
            0x00, // Global mode parameter -  Address
            0x7f, // MODE SET - Address
            [0x00] // 00 = GS Reset - Data
        );
    }

    private static analyzeGM(syx: SysExAcceptedArray): AnalyzedMIDIMessage {
        if (syx.length < 4) return OTHER;

        if (
            // Device control
            syx[2] === 0x04
        )
            switch (syx[3]) {
                default: {
                    return OTHER;
                }

                case 0x03: {
                    // Master Fine-Tuning
                    const tuningValue = ((syx[5] << 7) | syx[6]) - 8192;
                    const cents = Math.floor(tuningValue / 81.92); // [-100;+99] cents range
                    return {
                        type: "Master Fine Tune",
                        value: cents
                    };
                }

                case 0x04: {
                    // Master Coarse Tuning
                    return {
                        type: "Master Key Shift",
                        value: syx[5] - 64
                    };
                }

                case 0x05: {
                    // Global Parameter control
                    if (
                        syx[4] !== 0x01 || // Slot Path Length
                        syx[5] !== 0x01 || // Parameter ID Width
                        syx[6] !== 0x01 || // Value Width
                        syx[7] !== 0x01 // Slot Path MSB
                    ) {
                        return OTHER;
                    }

                    // Slot Path LSB
                    switch (syx[8]) {
                        default: {
                            return OTHER;
                        }

                        case 0x01: {
                            // Reverb
                            // Parameter
                            switch (syx[9]) {
                                default: {
                                    return OTHER;
                                }

                                case 0x01:
                                case 0x02: {
                                    return {
                                        type: "Reverb Param"
                                    };
                                }
                            }
                        }

                        case 0x02: {
                            // Chorus
                            // Parameter
                            switch (syx[9]) {
                                default: {
                                    return OTHER;
                                }

                                case 0x01:
                                case 0x02:
                                case 0x03:
                                case 0x04: {
                                    return { type: "Chorus Param" };
                                }
                            }
                        }
                    }
                }
            }

        if (syx[2] !== 0x09) return OTHER;
        switch (syx[3]) {
            default: {
                return OTHER;
            }

            case 0x01: {
                return { type: "GM On" };
            }

            case 0x02: {
                return { type: "GM Off" };
            }

            case 0x03: {
                return { type: "GM2 On" };
            }
        }
    }

    private static analyzeXG(syx: SysExAcceptedArray): AnalyzedMIDIMessage {
        // Ensure XG
        if (syx[2] !== 0x4c || syx.length < 7) return OTHER;
        const a1 = syx[3]; // Address 1
        const a2 = syx[4]; // Address 2
        const a3 = syx[5]; // Address 3
        const data = syx[6];

        if (a1 === 0x00 && a2 === 0x00) {
            // XG SYSTEM
            switch (a3) {
                default: {
                    return OTHER;
                }

                case 0x00: {
                    // MASTER TUNE
                    const tune =
                        ((syx[6] & 15) << 12) |
                        ((syx[7] & 15) << 8) |
                        ((syx[8] & 15) << 4) |
                        (syx[9] & 15);
                    const cents = (tune - 1024) / 10;
                    return {
                        type: "Master Fine Tune",
                        value: cents
                    };
                }

                case 0x06: {
                    // TRANSPOSE
                    return { type: "Master Key Shift", value: data - 64 };
                }

                // XG SYSTEM ON
                case 0x7e:
                // ALL PARAMETER RESET
                case 0x7f: {
                    return { type: "XG Reset" };
                }
            }
        }

        // XG EFFECT 1
        if (a1 === 0x02 && a2 === 0x01) {
            if (a3 <= 0x15) return { type: "Reverb Param" };
            if (a3 <= 0x35) return { type: "Chorus Param" };
            return { type: "Variation Param" };
        }

        // XG EFFECT 2
        if (a1 === 0x03 && a2 === 0x00) return { type: "Variation Param" };

        // XG MULTI PART
        if (a1 === 0x08 /* A2 is the channel number*/) {
            const channel = a2;
            // Avoid invalid channels
            if (channel >= 16) return OTHER;

            switch (a3) {
                default: {
                    return OTHER;
                }

                case 0x01: {
                    // Bank Select MSB
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.bankSelect,
                        value: data
                    };
                }

                case 0x02: {
                    // Bank Select LSB
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.bankSelectLSB,
                        value: data
                    };
                }

                case 0x03: {
                    // Program change
                    return {
                        type: "Program Change",
                        channel,
                        value: data
                    };
                }

                case 0x05: {
                    // Poly/mono
                    return {
                        type: "Controller Change",
                        channel,
                        controller:
                            data === 1
                                ? MIDIControllers.polyModeOn
                                : MIDIControllers.monoModeOn,
                        value: 0
                    };
                }

                case 0x07: {
                    // Part mode
                    return {
                        type: "Drums On",
                        channel,
                        isDrum: data > 0
                    };
                }

                case 0x08: {
                    // Note shift
                    return { type: "Key Shift", channel, value: data - 64 };
                }

                case 0x0b: {
                    // Volume
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.mainVolume,
                        value: data
                    };
                }

                case 0x0e: {
                    // Pan
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.pan,
                        value: data
                    };
                }

                case 0x12: {
                    // Chorus
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.chorusDepth,
                        value: data
                    };
                }

                case 0x13: {
                    // Reverb
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.reverbDepth,
                        value: data
                    };
                }

                case 0x15: {
                    // Vibrato rate
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.vibratoRate,
                        value: data
                    };
                }

                case 0x16: {
                    // Vibrato depth
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.vibratoDepth,
                        value: data
                    };
                }

                case 0x17: {
                    // Vibrato delay
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.vibratoDelay,
                        value: data
                    };
                }

                case 0x18: {
                    // Filter cutoff
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.brightness,
                        value: data
                    };
                }

                case 0x19: {
                    // Filter resonance
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.filterResonance,
                        value: data
                    };
                }

                case 0x1a: {
                    // Attack time
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.attackTime,
                        value: data
                    };
                }

                case 0x1b: {
                    // Decay time
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.decayTime,
                        value: data
                    };
                }

                case 0x0c: {
                    // Release time
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.releaseTime,
                        value: data
                    };
                }
            }
        }

        // Drum part setup
        if (a1 >> 4 === 3) return { type: "Drum Setup" };

        return OTHER;
    }

    private static analyzeGS(syx: SysExAcceptedArray): AnalyzedMIDIMessage {
        if (
            syx.length < 10 ||
            // Model ID (GS)
            syx[2] !== 0x42 ||
            // 0x12: DT1 (Device Transmit)
            syx[3] !== 0x12
        )
            return OTHER; // Something else

        // Address
        const a1 = syx[4];
        const a2 = syx[5];
        const a3 = syx[6];
        const data = syx[7];

        // GS reset check
        if (
            // Address 1 is 0x00 for SC-88 SYSTEM MODE SET and 0x40 for SC-55 MODE SET
            (a1 === 0x00 || a1 === 0x40) &&
            a2 === 0x00 // System Parameter
        ) {
            switch (a3) {
                // MODE SET
                case 0x7f: {
                    switch (data) {
                        case 0x00: {
                            // GS Reset/Mode-1
                            return { type: "GS Reset" };
                        }

                        case 0x7f: {
                            // GS Off, default to gm
                            return { type: "GM On" };
                        }
                    }
                    return OTHER;
                }

                // Master Tune
                case 0x00: {
                    const tune =
                        (data << 12) | (syx[8] << 8) | (syx[9] << 4) | syx[10];
                    const cents = (tune - 1024) / 10;
                    return { type: "Master Fine Tune", value: cents };
                }
            }
        }

        if (a1 === 0x41) return { type: "Drum Setup" };
        if (a1 !== 0x40) return OTHER;

        if (a2 === 0x00 && a3 === 0x05)
            return { type: "Master Key Shift", value: data - 64 };

        // Effects
        if (a2 === 0x01) {
            if (a3 >= 0x30 && a3 <= 0x37) return { type: "Reverb Param" };
            if (a3 >= 0x38 && a3 <= 0x40) return { type: "Chorus Param" };
            if (a3 >= 0x50 && a3 <= 0x5a) return { type: "Delay Param" };
        }

        // EFX Parameter
        if (a2 === 0x03 && a3 >= 0x00 && a3 <= 0x7f)
            return { type: "Insertion Param" };

        // Patch parameter
        if (a2 >> 4 === 1) {
            const channel = MIDIUtils.syxToChannel(a2 & 0x0f);
            switch (a3) {
                default: {
                    return OTHER;
                }

                case 0x00: {
                    // Tone number
                    return {
                        type: "Program Change",
                        channel,
                        value: data
                    };
                }

                case 0x13: {
                    // Mono/poly
                    return {
                        type: "Controller Change",
                        channel,
                        controller:
                            data === 1
                                ? MIDIControllers.polyModeOn
                                : MIDIControllers.monoModeOn,
                        value: 0
                    };
                }

                case 0x15: {
                    return {
                        type: "Drums On",
                        channel,
                        isDrum: data > 0
                    };
                }

                case 0x16: {
                    return {
                        type: "Key Shift",
                        channel,
                        value: data - 64
                    };
                }

                case 0x19: {
                    // Part level (cc#7)
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.mainVolume,
                        value: data
                    };
                }

                case 0x1c: {
                    // Pan position
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.pan,
                        value: data
                    };
                }

                case 0x21: {
                    // Chorus send
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.chorusDepth,
                        value: data
                    };
                }

                case 0x22: {
                    // Reverb send
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.reverbDepth,
                        value: data
                    };
                }

                case 0x2a: {
                    // Fine tune
                    // 0-16384
                    const tune = (data << 7) | syx[8];
                    const tuneCents = (tune - 8192) / 81.92;
                    return {
                        type: "Fine Tune",
                        channel,
                        value: tuneCents
                    };
                }

                case 0x2c: {
                    // Delay send
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.variationDepth,
                        value: data
                    };
                }

                case 0x30: {
                    // Vibrato rate
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.vibratoRate,
                        value: data
                    };
                }

                case 0x31: {
                    // Vibrato depth
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.vibratoDepth,
                        value: data
                    };
                }

                case 0x32: {
                    // Filter cutoff
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.brightness,
                        value: data
                    };
                }

                case 0x33: {
                    // Filter resonance
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.filterResonance,
                        value: data
                    };
                }

                case 0x34: {
                    // Attack time
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.attackTime,
                        value: data
                    };
                }

                case 0x35: {
                    // Decay time
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.decayTime,
                        value: data
                    };
                }

                case 0x36: {
                    // Release time
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.releaseTime,
                        value: data
                    };
                }

                case 0x37: {
                    // Vibrato delay
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.vibratoDelay,
                        value: data
                    };
                }
            }
        }

        // Patch Parameter Tone Map
        if (a2 >> 4 === 4) {
            const channel = MIDIUtils.syxToChannel(a2 & 0x0f);
            switch (a3) {
                default: {
                    return OTHER;
                }

                case 0x00:
                case 0x01: {
                    // Tone map number (cc#32)
                    return {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.bankSelectLSB,
                        value: data
                    };
                }

                case 0x22: {
                    return { type: "Insertion Param" };
                }
            }
        }

        return OTHER;
    }
}
