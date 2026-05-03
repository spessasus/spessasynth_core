import { MIDIMessage } from "../midi/midi_message";
import {
    type MIDIController,
    midiControllers,
    midiMessageTypes
} from "../midi/enums";
import type { SysExAcceptedArray } from "../synthesizer/audio_engine/engine_methods/system_exclusive/helpers";

export type AnalyzedSystemExclusive =
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
      };

const OTHER = Object.freeze({ type: "Other" }) as AnalyzedSystemExclusive;

/**
 * A set of handy functions for working with System Exclusive messages.
 * @internal
 */
export class SysEx {
    /**
     * Analyzes a MIDI System Exclusive message
     * and returns an identification and data for it.
     * @param syx the System Exclusive message, WITHOUT the first 0xF0 System Exclusive byte!
     */
    public static analyze(syx: SysExAcceptedArray): AnalyzedSystemExclusive {
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
     * GS/XG "part number" to channel number.
     * @param part
     */
    public static syxToChannel(part: number) {
        return [9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15][
            part % 16
        ];
    }

    /**
     * Channel number to GS/XG "part number"
     * @param channel
     */
    public static channelToSyx(channel: number) {
        return [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 10, 11, 12, 13, 14, 15][
            channel % 16
        ];
    }

    /**
     * Gets raw GS System Exclusive message, without the 0xF0 status byte.
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
            0x10, // Device ID (defaults to 16 on roland)
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
     * Sends a GS System Exclusive address
     * @param ticks
     * @param a1 Address 1
     * @param a2 Address 2
     * @param a3 Address 3
     * @param data Data, can be multiple bytes
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
            midiMessageTypes.systemExclusive,
            new Uint8Array(this.gsData(a1, a2, a3, data))
        );
    }

    public static gsDrumChange(channel: number, ticks: number): MIDIMessage {
        const chanAddress = 0x10 | this.channelToSyx(channel);
        return this.gsMessage(ticks, 40, chanAddress, 0x15, [0x01]);
    }

    /**
     * Gets a GS reset message System Exclusive
     * @param ticks
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

    private static analyzeGM(syx: SysExAcceptedArray): AnalyzedSystemExclusive {
        if (syx.length < 4 || syx[2] !== 0x09) return OTHER;
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

    private static analyzeXG(syx: SysExAcceptedArray): AnalyzedSystemExclusive {
        // Ensure XG
        if (syx[2] !== 0x4c || syx.length < 7) return OTHER;
        const a1 = syx[3]; // Address 1
        const a2 = syx[4]; // Address 2
        const a3 = syx[5]; // Address 3
        const data = syx[6];
        if (
            a1 === 0x00 && // XG SYSTEM
            a2 === 0x00 && // PARAMETER
            (a3 === 0x7f || // XG RESET
                a3 === 0x7e) // XG SYSTEM ON
        )
            return { type: "XG Reset" };

        // Effects
        if (a1 === 0x02 && a2 === 0x01) {
            if (a3 <= 0x15) return { type: "Reverb Param" };
            if (a3 <= 0x35) return { type: "Chorus Param" };
            return { type: "Variation Param" };
        }

        // Part setup
        if (a1 === 0x08 /* A2 is the channel number*/) {
            const channel = a2;
            // Avoid invalid channels
            if (channel >= 16) {
                return OTHER;
            }
            switch (a3) {
                default: {
                    return OTHER;
                }

                case 0x01: {
                    // Bank Select MSB
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.bankSelect,
                        value: data
                    };
                }

                case 0x02: {
                    // Bank Select LSB
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.bankSelectLSB,
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
                                ? midiControllers.polyModeOn
                                : midiControllers.monoModeOn,
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

                case 0x0b: {
                    // Volume
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.mainVolume,
                        value: data
                    };
                }

                case 0x0e: {
                    // Pan
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.pan,
                        value: data
                    };
                }

                case 0x12: {
                    // Chorus
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.chorusDepth,
                        value: data
                    };
                }

                case 0x13: {
                    // Reverb
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.reverbDepth,
                        value: data
                    };
                }

                case 0x15: {
                    // Vibrato rate
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.vibratoRate,
                        value: data
                    };
                }

                case 0x16: {
                    // Vibrato depth
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.vibratoDepth,
                        value: data
                    };
                }

                case 0x17: {
                    // Vibrato delay
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.vibratoDelay,
                        value: data
                    };
                }

                case 0x18: {
                    // Filter cutoff
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.brightness,
                        value: data
                    };
                }

                case 0x19: {
                    // Filter resonance
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.filterResonance,
                        value: data
                    };
                }

                case 0x1a: {
                    // Attack time
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.attackTime,
                        value: data
                    };
                }

                case 0x1b: {
                    // Decay time
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.decayTime,
                        value: data
                    };
                }

                case 0x0c: {
                    // Release time
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.releaseTime,
                        value: data
                    };
                }
            }
        }

        // Drum part setup
        if (a1 >> 4 === 3) return { type: "Drum Setup" };

        return OTHER;
    }

    private static analyzeGS(syx: SysExAcceptedArray): AnalyzedSystemExclusive {
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
            a2 === 0x00 && // MODE
            a3 === 0x7f // SET
        ) {
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
        }

        if (a1 === 0x41) return { type: "Drum Setup" };
        if (a1 !== 0x40) return OTHER;

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
            const channel = SysEx.syxToChannel(a2 & 0x0f);
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
                                ? midiControllers.polyModeOn
                                : midiControllers.monoModeOn,
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

                case 0x19: {
                    // Part level (cc#7)
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.mainVolume,
                        value: data
                    };
                }

                case 0x1c: {
                    // Pan position
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.pan,
                        value: data
                    };
                }

                case 0x21: {
                    // Chorus send
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.chorusDepth,
                        value: data
                    };
                }

                case 0x22: {
                    // Reverb send
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.reverbDepth,
                        value: data
                    };
                }

                case 0x2c: {
                    // Delay send
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.variationDepth,
                        value: data
                    };
                }

                case 0x30: {
                    // Vibrato rate
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.vibratoRate,
                        value: data
                    };
                }

                case 0x31: {
                    // Vibrato depth
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.vibratoDepth,
                        value: data
                    };
                }

                case 0x32: {
                    // Filter cutoff
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.brightness,
                        value: data
                    };
                }

                case 0x33: {
                    // Filter resonance
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.filterResonance,
                        value: data
                    };
                }

                case 0x34: {
                    // Attack time
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.attackTime,
                        value: data
                    };
                }

                case 0x35: {
                    // Decay time
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.decayTime,
                        value: data
                    };
                }

                case 0x36: {
                    // Release time
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.releaseTime,
                        value: data
                    };
                }

                case 0x37: {
                    // Vibrato delay
                    return {
                        type: "Controller Change",
                        channel,
                        controller: midiControllers.vibratoDelay,
                        value: data
                    };
                }
            }
        }

        // Patch Parameter Tone Map
        if (a2 >> 4 === 4) {
            const channel = SysEx.syxToChannel(a2 & 0x0f);
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
                        controller: midiControllers.bankSelectLSB,
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
