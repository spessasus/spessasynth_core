import { MIDIMessage } from "../midi_message";
import {
    type MIDIController,
    MIDIControllers,
    NonRegisteredLSB,
    NonRegisteredMSB,
    RegisteredParameterTypes
} from "../enums";

import type { SysExAcceptedArray } from "../types";
import type { GlobalMIDIParameter } from "../../synthesizer/audio_engine/parameters/midi";
import type { ChannelMIDIParameter } from "../../synthesizer/audio_engine/channel/parameters/midi";
import type { MIDISystem } from "../../soundbank/types";

type GlobalMIDIParameterMessage = {
    [P in keyof GlobalMIDIParameter]: {
        type: "Global MIDI Param";
        parameter: P;
        value: GlobalMIDIParameter[P];
    };
}[keyof GlobalMIDIParameter];

// Channel number may be above 15
type ChannelMIDIParameterMessage = {
    [P in keyof ChannelMIDIParameter]: {
        type: "Channel MIDI Param";
        parameter: P;
        value: ChannelMIDIParameter[P];
        channel: number;
    };
}[keyof ChannelMIDIParameter];
// Channel number may be above 15
type AnalyzedParameter =
    | { type: "Other" }
    | {
          type: "Controller Change";
          controller: MIDIController;
          value: number;
          channel: number;
      }
    | ChannelMIDIParameterMessage
    | { type: "Drum Setup" };

export type AnalyzedMIDIMessage =
    | AnalyzedParameter
    | { type: "Reverb Param" }
    | { type: "Chorus Param" }
    | { type: "Delay Param" }
    | { type: "Variation Param" }
    | { type: "Insertion Param" }
    | { type: "Drums On"; channel: number; isDrum: boolean }
    | { type: "Program Change"; channel: number; value: number }
    | { type: "Display Data" }
    | GlobalMIDIParameterMessage;

const OTHER = Object.freeze({ type: "Other" }) as AnalyzedParameter;

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
    ): AnalyzedParameter {
        switch (rpn) {
            default: {
                return OTHER;
            }

            case RegisteredParameterTypes.pitchWheelRange: {
                return {
                    type: "Channel MIDI Param",
                    channel,
                    parameter: "pitchWheelRange",
                    value: value / 128
                };
            }

            case RegisteredParameterTypes.fineTuning: {
                return {
                    type: "Channel MIDI Param",
                    channel,
                    parameter: "fineTune",
                    value: (value - 8192) / 81.92
                };
            }

            case RegisteredParameterTypes.coarseTuning: {
                return {
                    type: "Channel MIDI Param",
                    channel,
                    parameter: "keyShift",
                    value: (value >> 7) - 64
                };
            }

            case RegisteredParameterTypes.modulationDepth: {
                return {
                    type: "Channel MIDI Param",
                    channel,
                    parameter: "modulationDepth",
                    // Cents, so data / 128 * 100 is data / 1.28
                    value: value / 1.28
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
    ): AnalyzedParameter {
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

                    case NonRegisteredLSB.vibratoRate: {
                        return {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.vibratoRate,
                            value: value >> 7
                        };
                    }

                    case NonRegisteredLSB.vibratoDepth: {
                        return {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.vibratoDepth,
                            value: value >> 7
                        };
                    }

                    case NonRegisteredLSB.vibratoDelay: {
                        return {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.vibratoDelay,
                            value: value >> 7
                        };
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
     * Returns a list of MIDI events needed to set the given parameter.
     * @param ticks The ticks for all events.
     * @param system If the message has multiple ways of setting it,
     * this selects the preferred way. Otherwise, it prefers Universal (GM).
     * @param parameter The parameter to set.
     * @param value The value to set it to.
     */
    public static setGlobalMIDIParameter<P extends keyof GlobalMIDIParameter>(
        ticks: number,
        system: MIDISystem,
        parameter: P,
        value: GlobalMIDIParameter[P]
    ): MIDIMessage[] {
        switch (parameter) {
            case "system": {
                // Well, we set the system so we don't care about the current one
                return [MIDIUtils.reset(ticks, value as MIDISystem)];
            }

            case "keyShift": {
                // Three ways of setting it: GM. XG and GS.
                switch (system) {
                    default: {
                        // GM2 and GM are the same here
                        // Master Coarse Tuning
                        return [
                            MIDIUtils.deviceControlMessage(ticks, 0x04, [
                                0x00, // LSB is not used for key shift
                                (value as number) + 64
                            ])
                        ];
                    }

                    case "xg": {
                        // Transpose
                        return [
                            MIDIUtils.xgMessage(ticks, 0x00, 0x00, 0x06, [
                                (value as number) + 64
                            ])
                        ];
                    }

                    case "gs": {
                        // Master Key-Shift
                        return [
                            MIDIUtils.gsMessage(ticks, 0x40, 0x00, 0x05, [
                                (value as number) + 64
                            ])
                        ];
                    }
                }
            }

            case "fineTune": {
                // Again, all three systems have their own way of setting it, and they are all different
                switch (system) {
                    default: {
                        // GM tunes in 14-bit numbers, how nice!
                        const tuneValue = Math.floor(
                            (value as number) * 81.92 + 8192
                        );
                        return [
                            MIDIUtils.deviceControlMessage(ticks, 0x03, [
                                tuneValue & 0x7f, // LSB
                                (tuneValue >> 7) & 0x7f // MSB
                            ])
                        ];
                    }

                    case "xg": {
                        // -102.4 to 102.3, in 0.1 cent steps
                        // Real range is 0 to 2047 with 1024 as center
                        const tuneValue = Math.floor(
                            (value as number) * 10 + 1024
                        );
                        return [
                            MIDIUtils.xgMessage(ticks, 0x00, 0x00, 0x00, [
                                (tuneValue >> 12) & 0x0f,
                                (tuneValue >> 8) & 0x0f,
                                (tuneValue >> 4) & 0x0f,
                                tuneValue & 0x0f
                            ])
                        ];
                    }

                    case "gs": {
                        // Gs is -100 cents to 100 cents, 0.1 cent steps
                        // Real range is 24 to 2024, so narrower than XG
                        const tuneValue = Math.floor(
                            (value as number) * 10 + 1024
                        );
                        return [
                            MIDIUtils.gsMessage(ticks, 0x40, 0x00, 0x00, [
                                (tuneValue >> 12) & 0x0f,
                                (tuneValue >> 8) & 0x0f,
                                (tuneValue >> 4) & 0x0f,
                                tuneValue & 0x0f
                            ])
                        ];
                    }
                }
            }

            case "volume": {
                // All three once more!
                switch (system) {
                    default: {
                        const gainValue = Math.floor(
                            (value as number) * 16_383
                        );
                        return [
                            MIDIUtils.deviceControlMessage(ticks, 0x01, [
                                gainValue & 0x7f, // LSB
                                (gainValue >> 7) & 0x7f // MSB
                            ])
                        ];
                    }

                    case "xg": {
                        const gainValue = Math.floor((value as number) * 127);
                        return [
                            MIDIUtils.xgMessage(ticks, 0x00, 0x00, 0x04, [
                                gainValue
                            ])
                        ];
                    }

                    case "gs": {
                        // GS
                        const gainValue = Math.floor((value as number) * 127);
                        return [
                            MIDIUtils.gsMessage(ticks, 0x40, 0x00, 0x04, [
                                gainValue
                            ])
                        ];
                    }
                }
            }

            case "pan": {
                // Only GM and GS, XG doesn't have a pan message?
                switch (system) {
                    default: {
                        // Master Balance message
                        const balance =
                            Math.floor((value as number) * 8192) + 8192;

                        return [
                            MIDIUtils.deviceControlMessage(ticks, 0x02, [
                                balance & 0x7f, // LSB
                                (balance >> 7) & 0x7f // MSB
                            ])
                        ];
                    }

                    case "gs": {
                        // 63, it ranges from 1 to 127, NOT 0 to 127!
                        const balance = Math.floor((value as number) * 63) + 64;
                        return [
                            MIDIUtils.gsMessage(ticks, 0x40, 0x00, 0x06, [
                                balance
                            ])
                        ];
                    }
                }
            }
        }
    }

    /**
     * Returns a list of MIDI events needed to set the given parameter.
     * @param ticks The ticks for all events.
     * @param channel The channel number.
     * @param system If the message has multiple ways of setting it,
     * this selects the preferred way. Otherwise, it prefers Universal (GM).
     * @param parameter The parameter to set.
     * @param value The value to set it to.
     * @returns The list of `MIDIMessage`s that set the parameter.
     */
    public static setChannelMIDIParameter<P extends keyof ChannelMIDIParameter>(
        ticks: number,
        channel: number,
        system: MIDISystem,
        parameter: P,
        value: ChannelMIDIParameter[P]
    ): MIDIMessage[] {
        channel %= 16;
        const gsChannel = MIDIUtils.channelToSyx(channel);
        switch (parameter) {
            case "pressure": {
                return [
                    MIDIMessage.channelPressure(ticks, channel, value as number)
                ];
            }

            case "pitchWheel": {
                return [
                    MIDIMessage.pitchWheel(ticks, channel, value as number)
                ];
            }

            case "pitchWheelRange": {
                return MIDIMessage.registeredParameter(
                    ticks,
                    channel,
                    RegisteredParameterTypes.pitchWheelRange,
                    Math.floor((value as number) * 128)
                );
            }

            case "modulationDepth": {
                return MIDIMessage.registeredParameter(
                    ticks,
                    channel,
                    RegisteredParameterTypes.modulationDepth,
                    // Cents, so data / 128 * 100 is data / 1.28
                    Math.floor((value as number) * 1.28)
                );
            }

            case "rxChannel": {
                return system === "xg"
                    ? [
                          MIDIUtils.xgMessage(ticks, 0x08, channel, 0x04, [
                              value as number
                          ])
                      ]
                    : [
                          MIDIUtils.gsMessage(
                              ticks,
                              0x40,
                              0x10 | gsChannel,
                              0x02,
                              [value as number]
                          )
                      ];
            }

            case "polyMode": {
                return value
                    ? [
                          MIDIMessage.controllerChange(
                              ticks,
                              channel,
                              MIDIControllers.polyModeOn,
                              0
                          )
                      ]
                    : [
                          MIDIMessage.controllerChange(
                              ticks,
                              channel,
                              MIDIControllers.monoModeOn,
                              0
                          )
                      ];
            }

            case "keyShift": {
                // Prefer RPN as it's universal
                return MIDIMessage.registeredParameter(
                    ticks,
                    channel,
                    RegisteredParameterTypes.coarseTuning,
                    ((value as number) + 64) << 7
                );
            }

            case "fineTune": {
                // Prefer RPN as it's universal
                return MIDIMessage.registeredParameter(
                    ticks,
                    channel,
                    RegisteredParameterTypes.fineTuning,
                    // Resolution is 100/8192 cents
                    Math.floor((value as number) * 81.92 + 8192)
                );
            }

            case "randomPan": {
                // Only set via SysEx in both GS and XG (value 0 means random pan)
                return system === "xg"
                    ? [MIDIUtils.xgMessage(ticks, 0x08, channel, 0x0e, [0])]
                    : [
                          MIDIUtils.gsMessage(
                              ticks,
                              0x40,
                              0x10 | gsChannel,
                              0x1c,
                              [0]
                          )
                      ];
            }

            case "assignMode": {
                // XG/GS only
                switch (system) {
                    default:
                    case "gs": {
                        return [
                            MIDIUtils.gsMessage(
                                ticks,
                                0x40,
                                0x10 | gsChannel,
                                0x14,
                                [value as number]
                            )
                        ];
                    }

                    case "xg": {
                        return [
                            MIDIUtils.xgMessage(ticks, 0x08, channel, 0x06, [
                                value as number
                            ])
                        ];
                    }
                }
            }

            case "efxAssign": {
                // GS only (again)
                return [
                    MIDIUtils.gsMessage(ticks, 0x40, 0x10 | gsChannel, 0x22, [
                        value as number
                    ])
                ];
            }

            case "cc1": {
                // GS only!!! (again!)
                return [
                    MIDIUtils.gsMessage(ticks, 0x40, 0x10 | gsChannel, 0x1f, [
                        value as number
                    ])
                ];
            }

            case "cc2": {
                // The same as cc1, just different address
                return [
                    MIDIUtils.gsMessage(ticks, 0x40, 0x10 | gsChannel, 0x20, [
                        value as number
                    ])
                ];
            }

            case "drumMap": {
                // GS only, it's called "USE FOR RHYTHM PART" there
                return [
                    MIDIUtils.gsMessage(ticks, 0x40, 0x10 | gsChannel, 0x15, [
                        value as number
                    ])
                ];
            }

            case "velocitySenseDepth": {
                return system === "xg"
                    ? [
                          MIDIUtils.xgMessage(ticks, 0x08, channel, 0x0c, [
                              value as number
                          ])
                      ]
                    : [
                          MIDIUtils.gsMessage(
                              ticks,
                              0x40,
                              0x10 | gsChannel,
                              0x1a,
                              [value as number]
                          )
                      ];
            }

            case "velocitySenseOffset": {
                // Similar to above
                return system === "xg"
                    ? [
                          MIDIUtils.xgMessage(ticks, 0x08, channel, 0x0d, [
                              value as number
                          ])
                      ]
                    : [
                          MIDIUtils.gsMessage(
                              ticks,
                              0x40,
                              0x10 | gsChannel,
                              0x1b,
                              [value as number]
                          )
                      ];
            }
            // That's it!
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
    public static gs(a1: number, a2: number, a3: number, data: number[]) {
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
        return MIDIMessage.systemExclusive(ticks, this.gs(a1, a2, a3, data));
    }

    /**
     * Gets raw XG System Exclusive message bytes, without the 0xF0 status byte.
     * @param a1 Address 1
     * @param a2 Address 2
     * @param a3 Address 3
     * @param data Data, can be multiple bytes.
     */
    public static xg(a1: number, a2: number, a3: number, data: number[]) {
        return [
            0x43, // Yamaha
            0x10, // Device ID (defaults to 16 on Yamaha)
            0x4c, // XG
            a1,
            a2,
            a3,
            ...data,
            0xf7 // End of exclusive
        ];
    }

    /**
     * Gets a XG System Exclusive MIDI message.
     * @param ticks The tick time of the message.
     * @param a1 Address 1
     * @param a2 Address 2
     * @param a3 Address 3
     * @param data Data, can be multiple bytes.
     */
    public static xgMessage(
        ticks: number,
        a1: number,
        a2: number,
        a3: number,
        data: number[]
    ) {
        return MIDIMessage.systemExclusive(ticks, this.xg(a1, a2, a3, data));
    }

    /**
     * Gets a raw Device Control System Exclusive message bytes, without the 0xF0 status byte.
     * @param subID The sub ID.
     * @param data Data, can be multiple bytes.
     */
    public static deviceControl(subID: number, data: number[]) {
        return [
            0x7f, // Universal realtime
            0x7f, // Device ID (broadcast)
            0x04, // Device Control
            subID,
            ...data,
            0xf7 // End of exclusive
        ];
    }

    /**
     * Gets a Device Control System Exclusive MIDI message.
     * @param ticks The tick time of the message.
     * @param subID The sub ID.
     * @param data Data, can be multiple bytes.
     */
    public static deviceControlMessage(
        ticks: number,
        subID: number,
        data: number[]
    ) {
        return MIDIMessage.systemExclusive(
            ticks,
            this.deviceControl(subID, data)
        );
    }

    /**
     * Gets a selected reset System Exclusive MIDI message.
     * @param ticks The tick time of the message.
     * @param system The system to reset into.
     */
    public static reset(ticks: number, system: MIDISystem) {
        switch (system) {
            case "gs": {
                return this.gsMessage(
                    ticks,
                    0x40, // System parameter - Address
                    0x00, // Global mode parameter -  Address
                    0x7f, // MODE SET - Address
                    [0x00] // 00 = GS Reset - Data
                );
            }

            case "xg": {
                return this.xgMessage(
                    ticks,
                    0x00, // System parameter - Address
                    0x00, // Global mode parameter -  Address
                    0x7e, // XG On
                    [0x00] // 00 = GS Reset - Data
                );
            }

            case "gm": {
                return MIDIMessage.systemExclusive(ticks, [
                    0x7e, // Universal Non-Realtime
                    0x7f, // Broadcast
                    0x09, // General MIDI
                    0x01, // General MIDI 1 On
                    0x7f // End of exclusive
                ]);
            }

            case "gm2": {
                return MIDIMessage.systemExclusive(ticks, [
                    0x7e, // Universal Non-Realtime
                    0x7f, // Broadcast
                    0x09, // General MIDI
                    0x03, // General MIDI 2 On
                    0x7f // End of exclusive
                ]);
            }
        }
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

                case 0x01: {
                    // Master Volume
                    const value = ((syx[5] << 7) | syx[4]) / 16_383;
                    // It corresponds to CC volume, so volume is squared.
                    const gain = Math.pow(value, 2);
                    return {
                        type: "Global MIDI Param",
                        parameter: "volume",
                        value: gain
                    };
                }

                case 0x02: {
                    // Master Balance
                    // Complete MIDI 1.0 Detailed Specification page 57
                    // This is not specified in GM2 spec for some reason
                    const balance = (syx[5] << 7) | syx[4];
                    const value = (balance - 8192) / 8192;
                    return {
                        type: "Global MIDI Param",
                        parameter: "pan",
                        value
                    };
                }

                case 0x03: {
                    // Master Fine-Tuning
                    const tuningValue = ((syx[5] << 7) | syx[4]) - 8192;
                    const value = tuningValue / 81.92; // [-100;+99] cents range
                    return {
                        type: "Global MIDI Param",
                        parameter: "fineTune",
                        value
                    };
                }

                case 0x04: {
                    // Master Coarse Tuning
                    return {
                        type: "Global MIDI Param",
                        parameter: "keyShift",
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

                                case 0x00:
                                case 0x01: {
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

                                case 0x00:
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
                return {
                    type: "Global MIDI Param",
                    parameter: "system",
                    value: "gm"
                };
            }

            case 0x02: {
                return {
                    type: "Global MIDI Param",
                    parameter: "system",
                    value: "gm"
                };
            }

            case 0x03: {
                return {
                    type: "Global MIDI Param",
                    parameter: "system",
                    value: "gm2"
                };
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

        if (
            a1 === 0x06 || // Display letters
            a1 === 0x07 // Display bitmap
        ) {
            return { type: "Display Data" };
        }

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
                        type: "Global MIDI Param",
                        parameter: "fineTune",
                        value: cents
                    };
                }

                case 0x06: {
                    // TRANSPOSE
                    return {
                        type: "Global MIDI Param",
                        parameter: "keyShift",
                        value: data - 64
                    };
                }

                // XG SYSTEM ON
                case 0x7e:
                // ALL PARAMETER RESET
                case 0x7f: {
                    return {
                        type: "Global MIDI Param",
                        parameter: "system",
                        value: "xg"
                    };
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

                case 0x06: {
                    // Same Note Number Key On Assign
                    return {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "assignMode",
                        value: data
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
                    return {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "keyShift",
                        value: data - 64
                    };
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
            // 0x12: DT1 (Device Transmit)
            syx[3] !== 0x12
        )
            return OTHER; // Corrupted?

        if (
            // Model ID (Display Data)
            syx[2] === 0x45
        )
            return { type: "Display Data" };

        if (
            // Model ID (GS)
            syx[2] !== 0x42
        )
            return OTHER;

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
                // Master Tune
                case 0x00: {
                    const tune =
                        (data << 12) | (syx[8] << 8) | (syx[9] << 4) | syx[10];
                    const cents = (tune - 1024) / 10;
                    return {
                        type: "Global MIDI Param",
                        parameter: "fineTune",
                        value: cents
                    };
                }

                // Master Volume
                case 0x04: {
                    return {
                        type: "Global MIDI Param",
                        parameter: "volume",
                        value: data / 127
                    };
                }

                // Master Key-Shift
                case 0x05: {
                    return {
                        type: "Global MIDI Param",
                        parameter: "keyShift",
                        value: data - 64
                    };
                }

                // Master Pan
                case 0x06: {
                    return {
                        type: "Global MIDI Param",
                        parameter: "pan",
                        // 63, it ranges from 1 to 127, NOT 0 to 127!
                        value: (data - 64) / 63
                    };
                }

                // MODE SET
                case 0x7f: {
                    switch (data) {
                        // GS Reset/Mode-1 (Single Module Mode)
                        case 0x00:
                        // GS Reset/Mode-2 (Double Module Mode)
                        case 0x01: {
                            return {
                                type: "Global MIDI Param",
                                parameter: "system",
                                value: "gs"
                            };
                        }

                        case 0x7f: {
                            // GS Off, default to gm
                            return {
                                type: "Global MIDI Param",
                                parameter: "system",
                                value: "gm"
                            };
                        }
                    }
                    return OTHER;
                }
            }
        }

        if (a1 === 0x41) return { type: "Drum Setup" };
        // 0x40 -> Part Parameters, 0x50 -> Part Parameters (BLOCK B) Testcase: 95043-2.KYC.mid
        if (a1 !== 0x40 && a1 !== 0x50) return OTHER;

        // Block B is the second 16-channel set
        const channelOffset = a1 === 0x50 ? 16 : 0;

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
            const channel = MIDIUtils.syxToChannel(a2 & 0x0f) + channelOffset;
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
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "polyMode",
                        value: data === 1
                    };
                }

                case 0x14: {
                    // Assign mode
                    return {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "assignMode",
                        value: data
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
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "keyShift",
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

                case 0x1a: {
                    // Velocity Sense Depth
                    return {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "velocitySenseDepth",
                        value: data
                    };
                }

                case 0x1b: {
                    // Velocity Sense Offset
                    return {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "velocitySenseOffset",
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

                case 0x1f: {
                    // CC1 Controller number
                    return {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "cc1",
                        value: data as MIDIController
                    };
                }

                case 0x20: {
                    // CC2 Controller number
                    return {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "cc2",
                        value: data as MIDIController
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
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "fineTune",
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
            const channel = MIDIUtils.syxToChannel(a2 & 0x0f) + channelOffset;
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
                    return {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "efxAssign",
                        value: data === 1
                    };
                }
            }
        }

        return OTHER;
    }
}
