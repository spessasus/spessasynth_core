/**
 * Useful utilities for manipulating and parsing System Exclusive and other MIDI 1.0 messages.
 *
 * @group MIDI.Protocol
 * @module
 */
import { MIDIMessage } from "../midi_message";
import {
    type MIDIController,
    MIDIControllers,
    MIDIMessageTypes,
    NonRegisteredParameterTypesMSB,
    RegisteredParameterTypes
} from "../enums";

import type { MIDIEncodeOptions, SysExAcceptedArray } from "../types";
import type { MIDISystem } from "../../soundbank/types";
import type * as AnalyzedMessage from "./analyzed_message";
import {
    DEFAULT_GS_DRUM_MAP,
    DEFAULT_XG_DRUM_MAP,
    GSChorusAddressMap,
    GSDelayAddressMap,
    GSDrumParamMap,
    GSEqualizerAddressMap,
    GSInsertionAddressMap,
    GSReverbAddressMap,
    GSUserDrumParamMap,
    NRPNDrumParamByMSB,
    type NRPNDrumParameter,
    NRPNDrumParamMap,
    NRPNPartParamControllerMap,
    PartParamAddressMap,
    XGDrumParamMap
} from "./sysex_data";
import { fillWithDefaults } from "../../utils/fill_with_defaults";
import type { GSInsertionParameter } from "../../synthesizer/audio_engine/effects/gs/interface/gs_insertion_block";
import type { GSEqualizerParameter } from "../../synthesizer/audio_engine/effects/gs/interface/gs_equalizer_processor";

/**
 * The GS equalizer parameters by their address (`40 02 xx`).
 */
const GS_EQUALIZER_PARAMETER_BY_ADDRESS = new Map(
    Object.entries(GSEqualizerAddressMap).map(
        ([name, address]) =>
            [address, name as keyof GSEqualizerParameter] as const
    )
);

/**
 * The named GS insertion parameters by their address (`40 03 xx`).
 */
const GS_INSERTION_PARAMETER_BY_ADDRESS = new Map(
    Object.entries(GSInsertionAddressMap).map(
        ([name, address]) =>
            [address, name as keyof GSInsertionParameter] as const
    )
);

const OTHER = Object.freeze({ type: "Other" as const }) as {
    type: "Other";
};

// The analysis result of a message the analyzer does not recognize
const unrecognized = (syx: SysExAcceptedArray): AnalyzedMessage.SysEx[] => [
    { type: "Other With Data", data: syx }
];

const UNIVERSAL_NON_REALTIME_ID = 0x7e;
const UNIVERSAL_REALTIME_ID = 0x7f;
const ROLAND_ID = 0x41;
const YAMAHA_ID = 0x43;

/**
 * Finds the MIDI system of a MIDI system exclusive message, from its manufacturer ID.
 * Universal messages (GM and GM2) are reported as `"gm2"`, the system that has all of them.
 * @param syx The message.
 * @returns The MIDI system.
 * @throws If it is not a System Exclusive message or the manufacturer can't be recognized.
 */
export function systemOf(syx: MIDIMessage): MIDISystem {
    // The return type is needed, without it the literals widen to string in an options object
    if (
        syx.statusByte !== MIDIMessageTypes.systemExclusive ||
        syx.data.length === 0
    )
        throw new Error("Not a System Exclusive message.");
    const manufacturer = syx.data[0];
    if (
        manufacturer === UNIVERSAL_NON_REALTIME_ID ||
        manufacturer === UNIVERSAL_REALTIME_ID
    )
        return "gm2";
    if (manufacturer === YAMAHA_ID) return "xg";
    if (manufacturer === ROLAND_ID) return "gs";
    throw new Error(`Unrecognized manufacturer: ${manufacturer.toString(16)}`);
}

/**
 * Analyzes a MIDI System Exclusive message
 * and returns an identification and data for it.
 *
 * > **Note**
 * >
 * > Bulk dump and other sysExes are supported so this method may return more than one result.
 *
 * @param syx The System Exclusive message, WITHOUT the first `0xF0` System Exclusive byte!
 * @returns The analysis result(s) of the message.
 */
export function analyzeSysEx(syx: SysExAcceptedArray): AnalyzedMessage.SysEx[] {
    // At least Manufacturer ID, Device ID and XG/GS model ID
    if (syx.length < 3) return unrecognized(syx);
    switch (syx[0]) {
        default: {
            return unrecognized(syx);
        }

        case UNIVERSAL_NON_REALTIME_ID:
        case UNIVERSAL_REALTIME_ID: {
            return analyzeGM(syx);
        }

        case ROLAND_ID: {
            return analyzeGS(syx);
        }

        case YAMAHA_ID: {
            return analyzeXG(syx);
        }
    }
}

/**
 * Analyzes a MIDI Registered Parameter Number
 * and returns an identification and data for it.
 * @param channel The MIDI channel number.
 * @param rpn The 14-bit RPN number.
 * @param value The 14-bit value for that number.
 * @returns The analysis result of the message.
 */
export function analyzeRPN(
    channel: number,
    rpn: number,
    value: number
): AnalyzedMessage.Parameter {
    switch (rpn) {
        default: {
            return OTHER;
        }

        case RegisteredParameterTypes.pitchWheelRange: {
            return {
                type: "Channel MIDI Param",
                channel,
                parameter: "pitchWheelRange",
                // MSB is semitones, LSB is cents
                value: (value >> 7) + (value & 0x7f) / 100
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
 * @param drumPitchStep The drum pitch coarse resolution in semitones.
 * 0.5 for GS (SC-88 and above), 1 for XG and the SC-55 drum map (bank LSB 1).
 * @returns The analysis result of the message.
 */
export function analyzeNRPN(
    channel: number,
    nrpn: number,
    value: number,
    drumPitchStep = 0.5
): AnalyzedMessage.Parameter {
    const msb = nrpn >> 7;
    const lsb = nrpn & 0x7f;
    if (msb === NonRegisteredParameterTypesMSB.partParameter) {
        // CC alias, look it up
        const controller = NRPNPartParamControllerMap[lsb];
        if (controller === undefined) return OTHER;
        return {
            type: "Controller Change",
            channel,
            controller,
            value: value >> 7
        };
    }

    const parameter = NRPNDrumParamByMSB.get(msb);
    if (parameter === undefined) return OTHER;
    // Drum data entries are analyzed as 7-bit coarse values
    const coarse = value >> 7;
    return {
        type: "Channel Drum Setup",
        channel,
        key: lsb,
        parameter,
        value:
            parameter === "pitchCoarse"
                ? (coarse - 64) * drumPitchStep
                : parameter === "pitchFine"
                  ? coarse - 64
                  : coarse
    };
}

/**
 * The default options for {@link fromAnalyzedMessage}.
 */
export const DEFAULT_MIDI_ENCODE_OPTIONS: MIDIEncodeOptions = {
    preferredSystem: "gs",
    deviceID: undefined,
    ticks: 0,
    drumPitchStep: 0.5
};

/**
 * Encodes an analyzed message back into MIDI messages.
 * Analyzing the returned messages gives the same result again
 * (except random pan off and poly/mono mode, which come back as the controller changes they are written as).
 *
 * Standard channel messages are used whenever one exists, on every system:
 * controller changes, program changes, channel pressure, pitch wheel,
 * RPNs (pitch wheel range, fine and coarse tuning, modulation depth) and the drum NRPNs.
 * Everything else is one System Exclusive message, for the preferred system if it has that message.
 *
 * Continuous values (volume, pan, tuning, pitch wheel) are rounded and clamped to what their message can hold,
 * other values that do not fit their message throw.
 *
 * > **Note**
 * >
 * > Messages that analyze to more than one result (like the GS User Drum Set bulk dump or the GS tone number)
 * > can not be written back as one message. Encode each result on its own instead.
 *
 * > **Warning**
 * >
 * > An analyzed message does not record the system it came from.
 * > To write a result of an XG message back as XG, pass `preferredSystem: "xg"`
 * > (and `"gm"` for Universal ones), the default is GS.
 * > This matters for the messages both systems have, like `Map Drum Setup` (the GS map numbers and the XG setup
 * > numbers overlap) and the part parameters.
 *
 * > **Important**
 * >
 * > {@link AnalyzedMessage.OtherWithData} ignores device ID and preferred system.
 *
 * @param message The analyzed message, for example a result of {@link analyzeSysEx},
 * or of {@link analyzeRPN} without its `Other` (an unknown parameter, which can't be encoded).
 * @param options The encoding options: the preferred system for System Exclusive messages
 * that exist in more than one system (a message the system does not have uses the one it has),
 * the device ID, the tick time and the drum pitch resolution for the drum NRPNs.
 * @returns The MIDI messages: one channel message, the four controller changes of an RPN or NRPN,
 * or one System Exclusive message.
 * @example
 * ```ts
 * // GS reverb time, sent to the synthesizer
 * const [reverb] = MIDIUtils.fromAnalyzedMessage({
 *     type: "GS Reverb Param",
 *     parameter: "time",
 *     value: 80
 * });
 * synth.processMessage(reverb);
 *
 * // A pitch wheel range of 12 semitones on channel 3 at tick 480 (an RPN), written into a track
 * track.pushEvents(
 *     ...MIDIUtils.fromAnalyzedMessage(
 *         {
 *             type: "Channel MIDI Param",
 *             channel: 3,
 *             parameter: "pitchWheelRange",
 *             value: 12
 *         },
 *         { ticks: 480 }
 *     )
 * );
 * ```
 * @throws Error if the message can not be encoded at all
 * (like `Display Data`, or a drum parameter that has no NRPN),
 * a channel message is for a channel above 15 (put it on the port of the channel and pass `channel % 16`,
 * this includes analyzed GS block B and XG part 17 and up results that have a standard form),
 * or a value does not fit in it.
 */
export function fromAnalyzedMessage(
    message: AnalyzedMessage.Encodable,
    options: Partial<MIDIEncodeOptions> = DEFAULT_MIDI_ENCODE_OPTIONS
) {
    const { preferredSystem, deviceID, ticks, drumPitchStep } =
        fillWithDefaults(options, DEFAULT_MIDI_ENCODE_OPTIONS);
    if (message.type === "Other With Data") {
        return [MIDIMessage.systemExclusive(ticks, [...message.data])];
    }
    const name = `${message.type}${"parameter" in message ? ` (${message.parameter})` : ""}`;
    const channelMessages = encodeChannelMessage(message, ticks, drumPitchStep);
    if (channelMessages) {
        return channelMessages;
    }
    const data = encodeSysEx(message as AnalyzedMessage.SysEx, preferredSystem);
    if (deviceID !== undefined) data[1] = deviceID;
    // Everything except the closing F7 has to be a 7-bit data byte
    for (let i = 0; i < data.length - 1; i++) {
        const byte = data[i];
        if (!Number.isSafeInteger(byte) || byte < 0 || byte > 0x7f) {
            throw new Error(
                `Can not encode ${name}: byte ${i} would be ${byte}, outside of 0-127.`
            );
        }
    }
    return [MIDIMessage.systemExclusive(ticks, data)];
}

/**
 * Checks the channel of a channel message.
 * @param channel The channel.
 */
function checkChannel(channel: number) {
    if (!Number.isSafeInteger(channel) || channel < 0 || channel > 15) {
        throw new Error(
            `Channel ${channel} can not be set with a channel message, ` +
                "put it on the port of the channel and pass channel % 16."
        );
    }
    return channel;
}

/**
 * Checks a 14-bit value of a channel message.
 * @param name The parameter name, for the error.
 * @param value The value.
 */
function check14Bit(name: string, value: number) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 16_383) {
        throw new Error(
            `Can not encode ${name}: ${value} is outside of 0-16383.`
        );
    }
    return value;
}

/**
 * Checks a 7-bit value of a channel message.
 * They are checked before building the message, as its Uint8Array would wrap them.
 * @param name The value name, for the error.
 * @param value The value.
 */
function check7Bit(name: string, value: number) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 127) {
        throw new Error(
            `Can not encode ${name}: ${value} is outside of 0-127.`
        );
    }
    return value;
}

/**
 * Encodes an analyzed message that has a standard channel message form.
 * @param msg The analyzed message.
 * @param ticks The tick time of the messages.
 * @param drumPitchStep The drum pitch coarse resolution in semitones, for the drum NRPN.
 * @returns The messages, or undefined if the message has no channel message form.
 * @internal
 */
export function encodeChannelMessage(
    msg: AnalyzedMessage.Any,
    ticks: number,
    drumPitchStep: number
) {
    switch (msg.type) {
        case "Controller Change": {
            return [
                MIDIMessage.controllerChange(
                    ticks,
                    checkChannel(msg.channel),
                    check7Bit(
                        "Controller Change number",
                        msg.controller
                    ) as MIDIController,
                    check7Bit(`Controller Change ${msg.controller}`, msg.value)
                )
            ];
        }

        case "Program Change": {
            return [
                MIDIMessage.programChange(
                    ticks,
                    checkChannel(msg.channel),
                    check7Bit("Program Change", msg.value)
                )
            ];
        }

        case "Channel Drum Setup": {
            const { key, parameter, value } = msg;
            if (!Object.hasOwn(NRPNDrumParamMap, parameter)) {
                throw new Error(
                    `Channel Drum Setup ${parameter} has no NRPN, use Map Drum Setup instead.`
                );
            }
            const coarse =
                parameter === "pitchCoarse"
                    ? Math.round(value / drumPitchStep) + 64
                    : parameter === "pitchFine"
                      ? Math.round(value) + 64
                      : value;
            return MIDIMessage.nonRegisteredParameter(
                ticks,
                checkChannel(msg.channel),
                // The key is ORed into the NRPN number, it has to fit
                (NRPNDrumParamMap[parameter as NRPNDrumParameter] << 7) |
                    check7Bit("Channel Drum Setup key", key),
                // The data entry MSB is the value, like analyzeNRPN reads it
                check7Bit(
                    `Channel Drum Setup ${parameter}`,
                    coarse as number
                ) << 7
            );
        }

        case "Channel MIDI Param": {
            const name = `Channel MIDI Param ${msg.parameter}`;
            switch (msg.parameter) {
                case "pressure": {
                    return [
                        MIDIMessage.channelPressure(
                            ticks,
                            checkChannel(msg.channel),
                            check7Bit(name, msg.value)
                        )
                    ];
                }

                case "pitchWheel": {
                    return [
                        MIDIMessage.pitchWheel(
                            ticks,
                            checkChannel(msg.channel),
                            fitRound(msg.value, 16_383)
                        )
                    ];
                }

                case "polyMode": {
                    return [
                        MIDIMessage.controllerChange(
                            ticks,
                            checkChannel(msg.channel),
                            msg.value
                                ? MIDIControllers.polyModeOn
                                : MIDIControllers.monoModeOn,
                            0
                        )
                    ];
                }

                case "randomPan": {
                    // Random pan has no channel message, setting the pan turns it off
                    if (msg.value) return undefined;
                    return [
                        MIDIMessage.controllerChange(
                            ticks,
                            checkChannel(msg.channel),
                            MIDIControllers.pan,
                            64
                        )
                    ];
                }

                case "pitchWheelRange": {
                    // MSB is semitones, LSB is cents
                    const totalCents = Math.round(msg.value * 100);
                    const semitones = Math.floor(totalCents / 100);
                    return MIDIMessage.registeredParameter(
                        ticks,
                        checkChannel(msg.channel),
                        RegisteredParameterTypes.pitchWheelRange,
                        check14Bit(
                            name,
                            (semitones << 7) | (totalCents - semitones * 100)
                        )
                    );
                }

                case "modulationDepth": {
                    return MIDIMessage.registeredParameter(
                        ticks,
                        checkChannel(msg.channel),
                        RegisteredParameterTypes.modulationDepth,
                        // Cents, so data / 128 * 100 is data / 1.28
                        check14Bit(name, Math.round(msg.value * 1.28))
                    );
                }

                case "keyShift": {
                    return MIDIMessage.registeredParameter(
                        ticks,
                        checkChannel(msg.channel),
                        RegisteredParameterTypes.coarseTuning,
                        check14Bit(name, (Math.round(msg.value) + 64) << 7)
                    );
                }

                case "fineTune": {
                    return MIDIMessage.registeredParameter(
                        ticks,
                        checkChannel(msg.channel),
                        RegisteredParameterTypes.fineTuning,
                        // Resolution is 100/8192 cents
                        fitRound(msg.value * 81.92 + 8192, 16_383)
                    );
                }

                default: {
                    return undefined;
                }
            }
        }

        default: {
            return undefined;
        }
    }
}

/**
 * Picks the System Exclusive form of a message for the system.
 * A message without a form for the system uses the one it has (GS first for `gm` and `gm2`).
 * @param system The selected system.
 * @param name The message name, for the error.
 * @param forms The message for each system that has one. `universal` is used for `gm` and `gm2`.
 * @returns The message data.
 */
function pickForm(
    system: MIDISystem,
    name: string,
    forms: {
        gs?: () => number[];
        xg?: () => number[];
        universal?: () => number[];
    }
) {
    const form =
        (system === "gs"
            ? forms.gs
            : system === "xg"
              ? forms.xg
              : forms.universal) ??
        forms.gs ??
        forms.xg ??
        forms.universal;
    if (!form) {
        throw new Error(`${name} has no System Exclusive message.`);
    }
    return form();
}

/**
 * Clamps and rounds a value into the range of a data field.
 * @param value The value.
 * @param max The highest value of the field.
 */
function fitRound(value: number, max: number) {
    return Math.max(0, Math.min(max, Math.round(value)));
}

/**
 * Splits a value into four nibbles, the format of the GS and XG master tune.
 * @param value The value.
 */
function nibbles(value: number) {
    return [
        (value >> 12) & 0x0f,
        (value >> 8) & 0x0f,
        (value >> 4) & 0x0f,
        value & 0x0f
    ];
}

/**
 * A GS part parameter message.
 * @param channel The channel, 0-15 is block A, 16-31 is block B.
 * @param block The upper nibble of the second address byte: 1 for patch part, 2 for the controllers and 4 for the tone map.
 * @param a3 Address 3.
 * @param data The data bytes.
 */
function gsPart(channel: number, block: number, a3: number, data: number[]) {
    if (!Number.isSafeInteger(channel) || channel < 0 || channel > 31) {
        throw new Error(`Invalid GS part channel: ${channel}`);
    }
    return gs(
        channel < 16 ? 0x40 : 0x50,
        (block << 4) | channelToGSPart(channel),
        a3,
        data
    );
}

/**
 * A GM2 Global Parameter Control message (reverb and chorus).
 * @param slot The slot path LSB: 1 for reverb, 2 for chorus.
 * @param parameter The parameter number.
 * @param value The value.
 */
function gm2GlobalParameter(slot: number, parameter: number, value: number) {
    return deviceControl(0x05, [
        0x01,
        0x01,
        0x01,
        0x01,
        slot,
        parameter,
        value
    ]);
}

/**
 * The GM2 Global Parameter Control numbers of the GS chorus parameters.
 */
const GM2_CHORUS_PARAMETERS: Partial<
    Record<AnalyzedMessage.GSChorusParam["parameter"], number>
> = {
    macro: 0,
    rate: 1,
    depth: 2,
    feedback: 3,
    sendLevelToReverb: 4
};

/**
 * Encodes an analyzed message into System Exclusive data with the default device IDs.
 * @param msg The analyzed message.
 * @param system The selected system.
 * @returns The data, excluding the starting `0xF0`.
 */
function encodeSysEx(msg: AnalyzedMessage.SysEx, system: MIDISystem) {
    const universal = system === "gm" || system === "gm2";
    switch (msg.type) {
        case "Display Data": {
            throw new Error(`${msg.type} can not be encoded.`);
        }

        case "Global MIDI Param": {
            const name = `Global MIDI Param ${msg.parameter}`;
            switch (msg.parameter) {
                case "system": {
                    // A reset is a reset, whatever the selected system is
                    return resetData(msg.value);
                }

                case "keyShift": {
                    const v = Math.round(msg.value) + 64;
                    return pickForm(system, name, {
                        gs: () => gs(0x40, 0x00, 0x05, [v]),
                        xg: () => xg(0x00, 0x00, 0x06, [v]),
                        // Master Coarse Tuning, the LSB is not used
                        universal: () => deviceControl(0x04, [0x00, v])
                    });
                }

                case "fineTune": {
                    // GS and XG: 0.1 cent steps, 1024 is the center
                    const tune = fitRound(msg.value * 10 + 1024, 0xff_ff);
                    // Universal: 14-bit, 100 / 8192 cent steps
                    const gmTune = fitRound(msg.value * 81.92 + 8192, 16_383);
                    return pickForm(system, name, {
                        gs: () => gs(0x40, 0x00, 0x00, nibbles(tune)),
                        xg: () => xg(0x00, 0x00, 0x00, nibbles(tune)),
                        universal: () =>
                            deviceControl(0x03, [gmTune & 0x7f, gmTune >> 7])
                    });
                }

                case "volume": {
                    const v = fitRound(msg.value * 127, 127);
                    const gain = fitRound(msg.value * 16_383, 16_383);
                    return pickForm(system, name, {
                        gs: () => gs(0x40, 0x00, 0x04, [v]),
                        xg: () => xg(0x00, 0x00, 0x04, [v]),
                        universal: () =>
                            deviceControl(0x01, [gain & 0x7f, gain >> 7])
                    });
                }

                case "pan": {
                    // GS: 1 to 127, 64 is the center
                    const v = fitRound(msg.value * 63 + 64, 127);
                    // Universal Master Balance: 14-bit, 8192 is the center
                    const balance = fitRound(msg.value * 8192 + 8192, 16_383);
                    const masterBalance = () =>
                        deviceControl(0x02, [balance & 0x7f, balance >> 7]);
                    return pickForm(system, name, {
                        gs: () => gs(0x40, 0x00, 0x06, [v]),
                        // XG has no master pan, XG devices take the Universal Master Balance
                        xg: masterBalance,
                        universal: masterBalance
                    });
                }
            }
            break;
        }

        case "Channel MIDI Param": {
            const channel = msg.channel;
            const name = `Channel MIDI Param ${msg.parameter}`;
            switch (msg.parameter) {
                case "rxChannel": {
                    const v = msg.value;
                    return pickForm(system, name, {
                        gs: () => {
                            // GS reads 16 and above as off, so receiving on another port
                            // (like an XG part on port B) can not be written
                            if (v >= 16) {
                                throw new Error(
                                    `Can not encode ${name}: ${v} means off in GS.`
                                );
                            }
                            return gsPart(channel, 1, 0x02, [
                                v === -1 ? 0x10 : v
                            ]);
                        },
                        xg: () => xg(0x08, channel, 0x04, [v === -1 ? 0x7f : v])
                    });
                }

                case "randomPan": {
                    return pickForm(system, name, {
                        gs: () => gsPart(channel, 1, 0x1c, [0]),
                        xg: () => xg(0x08, channel, 0x0e, [0])
                    });
                }

                case "eqEnabled":
                case "efxAssign": {
                    const v = msg.value ? 1 : 0;
                    const a3 = msg.parameter === "eqEnabled" ? 0x20 : 0x22;
                    return pickForm(system, name, {
                        gs: () => gsPart(channel, 4, a3, [v])
                    });
                }

                case "dryLevel": {
                    const v = msg.value;
                    return pickForm(system, name, {
                        xg: () => xg(0x08, channel, 0x11, [v])
                    });
                }

                case "assignMode":
                case "drumMap":
                case "velocitySenseDepth":
                case "velocitySenseOffset":
                case "cc1":
                case "cc2": {
                    const address = PartParamAddressMap[msg.parameter];
                    const v = msg.value;
                    return pickForm(system, name, {
                        gs: () => gsPart(channel, 1, address.gs, [v]),
                        xg: () => xg(0x08, channel, address.xg, [v])
                    });
                }
            }
            break;
        }

        case "GS Reverb Param": {
            // GM2 has the GS reverb macros 0-5 (plate is 8 in GM2, 5 in GS),
            // The delay macros (6 and 7) stay GS
            if (universal && msg.parameter === "macro" && msg.value <= 0x05) {
                return gm2GlobalParameter(
                    0x01,
                    0x00,
                    msg.value === 0x05 ? 0x08 : msg.value
                );
            }
            if (universal && msg.parameter === "time") {
                return gm2GlobalParameter(0x01, 0x01, msg.value);
            }
            return gs(0x40, 0x01, GSReverbAddressMap[msg.parameter], [
                msg.value
            ]);
        }

        case "GS Chorus Param": {
            const gm2Parameter = GM2_CHORUS_PARAMETERS[msg.parameter];
            // GM2 has the GS chorus macros 0-5, the short delays (6 and 7) stay GS
            if (
                universal &&
                gm2Parameter !== undefined &&
                (msg.parameter !== "macro" || msg.value <= 0x05)
            ) {
                return gm2GlobalParameter(0x02, gm2Parameter, msg.value);
            }
            return gs(0x40, 0x01, GSChorusAddressMap[msg.parameter], [
                msg.value
            ]);
        }

        case "GS Delay Param": {
            return gs(0x40, 0x01, GSDelayAddressMap[msg.parameter], [
                msg.value
            ]);
        }

        case "GS Equalizer Param": {
            return gs(0x40, 0x02, GSEqualizerAddressMap[msg.parameter], [
                msg.value
            ]);
        }

        case "GS Insertion Param": {
            const { parameter, value } = msg;
            if (parameter === "type") {
                return gs(0x40, 0x03, 0x00, [value >> 8, value & 0xff]);
            }
            if (typeof parameter === "string") {
                return gs(0x40, 0x03, GSInsertionAddressMap[parameter], [
                    typeof value === "boolean" ? (value ? 1 : 0) : value
                ]);
            }
            if (
                !Number.isSafeInteger(parameter) ||
                parameter < 0 ||
                parameter > 19
            ) {
                throw new Error(`Invalid GS insertion parameter: ${parameter}`);
            }
            return gs(0x40, 0x03, parameter + 3, [value]);
        }

        case "XG Reverb Param": {
            const { parameter, value } = msg;
            switch (parameter) {
                case "type": {
                    return xg(0x02, 0x01, 0x00, [value >> 8, value & 0xff]);
                }
                case "return": {
                    return xg(0x02, 0x01, 0x0c, [value]);
                }
                case "pan": {
                    return xg(0x02, 0x01, 0x0d, [value]);
                }
                default: {
                    checkXGEffectParameter("reverb", parameter);
                    return xg(
                        0x02,
                        0x01,
                        parameter + (parameter < 10 ? 0x02 : 0x06),
                        [value]
                    );
                }
            }
        }

        case "XG Chorus Param": {
            const { parameter, value } = msg;
            switch (parameter) {
                case "type": {
                    return xg(0x02, 0x01, 0x20, [value >> 8, value & 0xff]);
                }
                case "return": {
                    return xg(0x02, 0x01, 0x2c, [value]);
                }
                case "pan": {
                    return xg(0x02, 0x01, 0x2d, [value]);
                }
                case "sendToReverb": {
                    return xg(0x02, 0x01, 0x2e, [value]);
                }
                default: {
                    checkXGEffectParameter("chorus", parameter);
                    return xg(
                        0x02,
                        0x01,
                        parameter + (parameter < 10 ? 0x22 : 0x26),
                        [value]
                    );
                }
            }
        }

        case "XG Variation Param": {
            switch (msg.parameter) {
                case "connection": {
                    if (msg.value !== "system" && msg.value !== "insertion") {
                        throw new Error(
                            `Invalid XG variation connection: ${String(msg.value)}`
                        );
                    }
                    // 0 = insertion, 1 = system
                    return xg(0x02, 0x01, 0x5a, [
                        msg.value === "system" ? 1 : 0
                    ]);
                }
                case "type": {
                    return xg(0x02, 0x01, 0x40, [
                        msg.value >> 8,
                        msg.value & 0xff
                    ]);
                }
                case "return": {
                    return xg(0x02, 0x01, 0x56, [msg.value]);
                }
                case "pan": {
                    return xg(0x02, 0x01, 0x57, [msg.value]);
                }
                case "sendToReverb": {
                    return xg(0x02, 0x01, 0x58, [msg.value]);
                }
                case "sendToChorus": {
                    return xg(0x02, 0x01, 0x59, [msg.value]);
                }
                case "partNumber": {
                    return xg(0x02, 0x01, 0x5b, [msg.value]);
                }
                default: {
                    const { parameter, value } = msg;
                    checkXGEffectParameter("variation", parameter);
                    // Parameters 1-10 are 14-bit, 11-16 7-bit
                    return parameter < 10
                        ? xg(0x02, 0x01, 0x42 + parameter * 2, [
                              value >> 7,
                              value & 0x7f
                          ])
                        : xg(0x02, 0x01, 0x70 + parameter - 10, [value]);
                }
            }
        }

        case "XG Insertion Param": {
            const { insertionNumber, parameter, value } = msg;
            switch (parameter) {
                case "type": {
                    return xg(0x03, insertionNumber, 0x00, [
                        value >> 8,
                        value & 0xff
                    ]);
                }
                case "partNumber": {
                    return xg(0x03, insertionNumber, 0x0c, [value]);
                }
                default: {
                    checkXGEffectParameter("insertion", parameter);
                    if (parameter >= 10) {
                        // Parameters 11-16 only have single byte addresses
                        return xg(
                            0x03,
                            insertionNumber,
                            0x20 + parameter - 10,
                            [value]
                        );
                    }
                    return value >> 7 === 0
                        ? // Fits in the LSB alone: LSB-only address
                          xg(0x03, insertionNumber, 0x02 + parameter, [value])
                        : // Needs the MSB: two-byte [Ext.2] address
                          // Yamaha XG spec v1.32, page 41.
                          xg(0x03, insertionNumber, 0x30 + parameter * 2, [
                              value >> 7,
                              value & 0x7f
                          ]);
                }
            }
        }

        case "Map Drum Setup": {
            const { drumMap, key, parameter, value } = msg;
            const name = `Map Drum Setup ${parameter}`;
            return pickForm(system, name, {
                gs: () => {
                    if (parameter === "pitchFine") {
                        throw new Error(
                            `${name} has no GS System Exclusive message.`
                        );
                    }
                    // PLAY NOTE is relative to 60, in SC-88 steps (50 cents), like the analysis assumes
                    const v =
                        parameter === "pitchCoarse"
                            ? 60 + Math.round(value / 0.5)
                            : typeof value === "boolean"
                              ? value
                                  ? 1
                                  : 0
                              : value;
                    const mapIndex = drumMap - DEFAULT_GS_DRUM_MAP;
                    if (
                        !Number.isSafeInteger(mapIndex) ||
                        mapIndex < 0 ||
                        mapIndex > 7
                    ) {
                        throw new Error(`Invalid GS drum map: ${drumMap}`);
                    }
                    // The parameter is ORed into the address, so an unknown one would not reach the byte check
                    if (!Object.hasOwn(GSDrumParamMap, parameter)) {
                        throw new Error(
                            `Invalid GS drum parameter: ${parameter}`
                        );
                    }
                    return gs(
                        0x41,
                        (mapIndex << 4) | GSDrumParamMap[parameter],
                        key,
                        [v]
                    );
                },
                xg: () => {
                    const v =
                        parameter === "pitchCoarse" || parameter === "pitchFine"
                            ? Math.round(value) + 64
                            : typeof value === "boolean"
                              ? value
                                  ? 1
                                  : 0
                              : value;
                    const setup = drumMap - DEFAULT_XG_DRUM_MAP;
                    if (
                        !Number.isSafeInteger(setup) ||
                        setup < 0 ||
                        setup > 15
                    ) {
                        throw new Error(`Invalid XG drum setup: ${drumMap}`);
                    }
                    return xg(0x30 + setup, key, XGDrumParamMap[parameter], [
                        v
                    ]);
                }
            });
        }

        case "User Drum Setup": {
            const { drumSet, midiNote, parameter, value } = msg;
            if (parameter === "pitchFine") {
                throw new Error(
                    "User Drum Setup pitchFine has no System Exclusive message."
                );
            }
            if (drumSet !== 0 && drumSet !== 1) {
                throw new Error(`Invalid User Drum Set: ${drumSet}`);
            }
            // The parameter is ORed into the address, so an unknown one would not reach the byte check
            if (!Object.hasOwn(GSUserDrumParamMap, parameter)) {
                throw new Error(
                    `Invalid User Drum Set parameter: ${parameter}`
                );
            }
            // PLAY NOTE is relative to 60
            const v =
                parameter === "pitchCoarse"
                    ? 60 + Math.round(value)
                    : typeof value === "boolean"
                      ? value
                          ? 1
                          : 0
                      : value;
            return gs(
                0x21,
                (drumSet << 4) | GSUserDrumParamMap[parameter],
                midiNote,
                [v]
            );
        }
    }
    throw new Error(`Unknown analyzed message: ${JSON.stringify(msg)}`);
}

/**
 * Checks the number of an XG effect type parameter.
 * @param effect The effect name, for the error.
 * @param parameter The 0-based parameter number.
 */
function checkXGEffectParameter(effect: string, parameter: number) {
    if (!Number.isSafeInteger(parameter) || parameter < 0 || parameter > 15) {
        throw new Error(`Invalid XG ${effect} parameter: ${parameter}`);
    }
}

/**
 * Converts GS part number to MIDI channel number.
 * @param part The part number.
 * @returns The MIDI Channel number.
 */
export function gsPartToChannel(part: number) {
    return [9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15][part % 16];
}

/**
 * The channel a GS part address reaches, seen from the sender's port.
 * The synthesizer and the SysEx analyzer resolve GS parts here.
 * The encoder (channel to part) still has its own mapping.
 * @param block The address byte: 0x40 (block A) or 0x50 (block B).
 * @param part The part number (the low nibble of the address).
 * @param senderOffset The channel offset of the port the message came from.
 * @internal
 */
export function gsPartAddress(
    block: number,
    part: number,
    senderOffset: number
) {
    // Block B is the second 16-channel set
    return gsPartToChannel(part) + (block === 0x50 ? 16 : 0) + senderOffset;
}

/**
 * The channel a GS part receives on (Rx. channel), seen from the sender's port, -1 for OFF.
 * @param block The address byte: 0x40 (block A) or 0x50 (block B).
 * @param value The Rx. channel value. 0x10 and anything above it is OFF (verified on hardware).
 * @param senderOffset The channel offset of the port the message came from.
 * @internal
 */
export function gsRxAddress(
    block: number,
    value: number,
    senderOffset: number
) {
    return value >= 0x10
        ? -1
        : value + (block === 0x50 ? 16 : 0) + senderOffset;
}

/**
 * The channel an XG part number reaches, seen from the sender's port.
 * @param part The part number.
 * @param senderOffset The channel offset of the port the message came from.
 * @internal
 */
export function xgPartAddress(part: number, senderOffset: number) {
    return part + senderOffset;
}

/**
 * The channel an XG part receives on (Rcv CHANNEL), seen from the sender's port, -1 for OFF.
 * @param value The Rcv CHANNEL value, 0x7F is OFF.
 * @param senderOffset The channel offset of the port the message came from.
 * @internal
 */
export function xgRxAddress(value: number, senderOffset: number) {
    return value === 0x7f ? -1 : value + senderOffset;
}

/**
 * Converts MIDI channel number to GS "part number".
 * @param channel The MIDI channel number.
 * @returns The GS part number.
 */
export function channelToGSPart(channel: number) {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 10, 11, 12, 13, 14, 15][channel % 16];
}

/**
 * Gets raw GS Data set 1 (DT1) System Exclusive message bytes.
 *
 * > **Tip**
 * >
 * > Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf)
 * > for the addresses for specific parameters.
 *
 * @param a1 Address 1
 * @param a2 Address 2
 * @param a3 Address 3
 * @param data Data, can be multiple bytes.
 * @param deviceID The device ID, 16 by default.
 * @returns The binary data of the MIDI message, excluding the starting `0xF0` byte.
 */
export function gs(
    a1: number,
    a2: number,
    a3: number,
    data: number[],
    deviceID = 0x10
) {
    // Calculate checksum
    // SC 8850 manual, page 245
    const sum = a1 + a2 + a3 + data.reduce((sum, cur) => sum + cur, 0);
    const checksum = (128 - (sum % 128)) & 0x7f;
    return [
        0x41, // Roland
        deviceID, // Device ID (defaults to 16 on Roland)
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
 * Gets a GS Data set 1 (DT1) System Exclusive MIDI message.
 *
 * > **Tip**
 * >
 * > Refer to [SC-8850 Owner's Manual](https://cdn.roland.com/assets/media/pdf/SC-8850_OM.pdf)
 * > for the addresses for specific parameters.
 *
 * @param ticks The MIDI tick time of the message.
 * @param a1 Address 1
 * @param a2 Address 2
 * @param a3 Address 3
 * @param data Data, can be multiple bytes.
 * @param deviceID The device ID, 16 by default.
 * @returns The System Exclusive MIDI message.
 */
export function gsMessage(
    ticks: number,
    a1: number,
    a2: number,
    a3: number,
    data: number[],
    deviceID = 0x10
) {
    return MIDIMessage.systemExclusive(ticks, gs(a1, a2, a3, data, deviceID));
}

/**
 * Gets raw XG System Exclusive message bytes.
 * @param a1 Address 1
 * @param a2 Address 2
 * @param a3 Address 3
 * @param data Data, can be multiple bytes.
 * @param deviceID The device ID, 16 by default.
 * @returns The binary data of the MIDI message, excluding the starting `0xF0` byte.
 */
export function xg(
    a1: number,
    a2: number,
    a3: number,
    data: number[],
    deviceID = 0x10
) {
    return [
        0x43, // Yamaha
        deviceID, // Device ID (defaults to 16 on Yamaha)
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
 * @param deviceID The device ID, 16 by default.
 * @returns The System Exclusive MIDI message.
 */
export function xgMessage(
    ticks: number,
    a1: number,
    a2: number,
    a3: number,
    data: number[],
    deviceID = 0x10
) {
    return MIDIMessage.systemExclusive(ticks, xg(a1, a2, a3, data, deviceID));
}

/**
 * Gets a raw Device Control System Exclusive message bytes.
 * @param subID The sub ID.
 * @param data Data, can be multiple bytes.
 * @param deviceID The device ID, 127 (broadcast) by default.
 * @returns The binary MIDI message data, excluding the starting `0xF0` byte.
 */
export function deviceControl(subID: number, data: number[], deviceID = 0x7f) {
    return [
        0x7f, // Universal realtime
        deviceID, // Device ID (defaults to broadcast)
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
 * @param deviceID The device ID, 127 (broadcast) by default.
 * @returns The system exclusive MIDI message.
 */
export function deviceControlMessage(
    ticks: number,
    subID: number,
    data: number[],
    deviceID = 0x7f
) {
    return MIDIMessage.systemExclusive(
        ticks,
        deviceControl(subID, data, deviceID)
    );
}

/**
 * Gets a selected reset System Exclusive MIDI message.
 * @param ticks The tick time of the message.
 * @param system The system to reset into.
 * @returns The system exclusive MIDI message.
 */
export function reset(ticks: number, system: MIDISystem) {
    return MIDIMessage.systemExclusive(ticks, resetData(system));
}

/**
 * The data of a reset System Exclusive message.
 * @param system The system to reset into.
 * @returns The data, excluding the starting `0xF0` byte.
 */
function resetData(system: MIDISystem) {
    switch (system) {
        case "gs": {
            return gs(
                0x40, // System parameter - Address
                0x00, // Global mode parameter -  Address
                0x7f, // MODE SET - Address
                [0x00] // 00 = GS Reset - Data
            );
        }

        case "xg": {
            return xg(
                0x00, // System parameter - Address
                0x00, // Global mode parameter -  Address
                0x7e, // XG On
                [0x00] // 00 = XG System On - Data
            );
        }

        case "gm": {
            return [
                0x7e, // Universal Non-Realtime
                0x7f, // Broadcast
                0x09, // General MIDI
                0x01, // General MIDI 1 On
                0xf7 // End of exclusive
            ];
        }

        case "gm2": {
            return [
                0x7e, // Universal Non-Realtime
                0x7f, // Broadcast
                0x09, // General MIDI
                0x03, // General MIDI 2 On
                0xf7 // End of exclusive
            ];
        }
    }
}

function analyzeGM(syx: SysExAcceptedArray): AnalyzedMessage.SysEx[] {
    if (syx.length < 4) return unrecognized(syx);
    const isRealtime = syx[0] === 0x7f;

    if (
        // Device control (realtime)
        isRealtime &&
        syx[2] === 0x04
    )
        switch (syx[3]) {
            default: {
                return unrecognized(syx);
            }

            case 0x01: {
                // Master Volume
                const value = ((syx[5] << 7) | syx[4]) / 16_383;
                // The volume is squared, but this is specific to the parameter, so use linear here.
                return [
                    {
                        type: "Global MIDI Param",
                        parameter: "volume",
                        value
                    }
                ];
            }

            case 0x02: {
                // Master Balance
                // Complete MIDI 1.0 Detailed Specification page 57
                // This is not specified in GM2 spec for some reason
                const balance = (syx[5] << 7) | syx[4];
                const value = (balance - 8192) / 8192;
                return [
                    {
                        type: "Global MIDI Param",
                        parameter: "pan",
                        value
                    }
                ];
            }

            case 0x03: {
                // Master Fine-Tuning
                const tuningValue = ((syx[5] << 7) | syx[4]) - 8192;
                const value = tuningValue / 81.92; // [-100;+99] cents range
                return [
                    {
                        type: "Global MIDI Param",
                        parameter: "fineTune",
                        value
                    }
                ];
            }

            case 0x04: {
                // Master Coarse Tuning
                return [
                    {
                        type: "Global MIDI Param",
                        parameter: "keyShift",
                        value: syx[5] - 64
                    }
                ];
            }

            case 0x05: {
                // Global Parameter control
                if (
                    syx[4] !== 0x01 || // Slot Path Length
                    syx[5] !== 0x01 || // Parameter ID Width
                    syx[6] !== 0x01 || // Value Width
                    syx[7] !== 0x01 // Slot Path MSB
                ) {
                    return unrecognized(syx);
                }

                // Slot Path LSB
                switch (syx[8]) {
                    default: {
                        return unrecognized(syx);
                    }

                    case 0x01: {
                        // Reverb
                        const value = syx[10];
                        // Parameter
                        switch (syx[9]) {
                            default: {
                                return unrecognized(syx);
                            }

                            case 0x00: {
                                // Reverb type
                                // Match 8850 manual, page 231
                                // All match except for plate which is 8 in GM and 5 in GS
                                return [
                                    {
                                        type: "GS Reverb Param",
                                        parameter: "macro",
                                        value: value === 0x08 ? 0x05 : value
                                    }
                                ];
                            }
                            case 0x01: {
                                // Reverb time
                                return [
                                    {
                                        type: "GS Reverb Param",
                                        parameter: "time",
                                        value
                                    }
                                ];
                            }
                        }
                    }

                    case 0x02: {
                        // Chorus

                        const value = syx[10];
                        // Parameter
                        switch (syx[9]) {
                            default: {
                                return unrecognized(syx);
                            }

                            case 0x00: {
                                // Chorus type
                                // Match 8850 manual, page 231
                                // All match
                                return [
                                    {
                                        type: "GS Chorus Param",
                                        parameter: "macro",
                                        value
                                    }
                                ];
                            }
                            case 0x01: {
                                // Mod rate
                                return [
                                    {
                                        type: "GS Chorus Param",
                                        parameter: "rate",
                                        value
                                    }
                                ];
                            }
                            case 0x02: {
                                // Mod depth
                                return [
                                    {
                                        type: "GS Chorus Param",
                                        parameter: "depth",
                                        value
                                    }
                                ];
                            }
                            case 0x03: {
                                // Mod feedback
                                return [
                                    {
                                        type: "GS Chorus Param",
                                        parameter: "feedback",
                                        value
                                    }
                                ];
                            }
                            case 0x04: {
                                // Mod send to reverb
                                return [
                                    {
                                        type: "GS Chorus Param",
                                        parameter: "sendLevelToReverb",
                                        value
                                    }
                                ];
                            }
                        }
                    }
                }
            }
        }

    // General MIDI (non-realtime)
    if (isRealtime || syx[2] !== 0x09) return unrecognized(syx);
    switch (syx[3]) {
        default: {
            return unrecognized(syx);
        }

        case 0x01: {
            return [
                {
                    type: "Global MIDI Param",
                    parameter: "system",
                    value: "gm"
                }
            ];
        }

        case 0x02: {
            // GM System Off
            return [
                {
                    type: "Global MIDI Param",
                    parameter: "system",
                    value: "gs"
                }
            ];
        }

        case 0x03: {
            return [
                {
                    type: "Global MIDI Param",
                    parameter: "system",
                    value: "gm2"
                }
            ];
        }
    }
}

function analyzeXG(syx: SysExAcceptedArray): AnalyzedMessage.SysEx[] {
    // Ensure XG, and a parameter change (1n). Bulk dumps (0n) and requests (2n, 3n) are laid out differently
    if (syx[2] !== 0x4c || (syx[1] & 0xf0) !== 0x10 || syx.length < 7)
        return unrecognized(syx);
    const a1 = syx[3]; // Address 1
    if (
        a1 === 0x06 || // Display letters
        a1 === 0x07 // Display bitmap
    ) {
        return [{ type: "Display Data" }];
    }

    const a2 = syx[4]; // Address 2
    const a3 = syx[5]; // Address 3
    // Value = syx[6]
    const value = syx[6];

    if (a1 === 0x00 && a2 === 0x00) {
        // XG SYSTEM
        switch (a3) {
            default: {
                return unrecognized(syx);
            }

            case 0x00: {
                // MASTER TUNE
                const tune =
                    ((syx[6] & 15) << 12) |
                    ((syx[7] & 15) << 8) |
                    ((syx[8] & 15) << 4) |
                    (syx[9] & 15);
                const cents = (tune - 1024) / 10;
                return [
                    {
                        type: "Global MIDI Param",
                        parameter: "fineTune",
                        value: cents
                    }
                ];
            }

            case 0x04: {
                // MASTER VOLUME
                return [
                    {
                        type: "Global MIDI Param",
                        parameter: "volume",
                        value: value / 127
                    }
                ];
            }

            case 0x05: {
                // MASTER ATTENUATOR
                return [
                    {
                        type: "Global MIDI Param",
                        parameter: "volume",
                        value: (127 - value) / 127
                    }
                ];
            }

            case 0x06: {
                // TRANSPOSE
                return [
                    {
                        type: "Global MIDI Param",
                        parameter: "keyShift",
                        value: value - 64
                    }
                ];
            }

            // XG SYSTEM ON
            case 0x7e:
            // ALL PARAMETER RESET
            case 0x7f: {
                return [
                    {
                        type: "Global MIDI Param",
                        parameter: "system",
                        value: "xg"
                    }
                ];
            }
        }
    }

    // XG EFFECT 1
    if (a1 === 0x02 && a2 === 0x01) {
        switch (a3) {
            case 0x00: {
                // Reverb type: 2 bytes MSB, LSB
                if (syx.length < 9) return unrecognized(syx);
                return [
                    {
                        type: "XG Reverb Param",
                        parameter: "type",
                        value: (value << 8) | syx[7]
                    }
                ];
            }

            case 0x02:
            case 0x03:
            case 0x04:
            case 0x05:
            case 0x06:
            case 0x07:
            case 0x08:
            case 0x09:
            case 0x0a:
            case 0x0b: {
                return [
                    {
                        type: "XG Reverb Param",
                        parameter: a3 - 0x02,
                        value
                    }
                ];
            }

            case 0x0c: {
                return [
                    {
                        type: "XG Reverb Param",
                        parameter: "return",
                        value
                    }
                ];
            }
            case 0x0d: {
                return [
                    {
                        type: "XG Reverb Param",
                        parameter: "pan",
                        value
                    }
                ];
            }

            case 0x10:
            case 0x11:
            case 0x12:
            case 0x13:
            case 0x14:
            case 0x15: {
                return [
                    {
                        type: "XG Reverb Param",
                        parameter: a3 - 0x06, // 0x10 -> 10 ... 0x15 -> 15
                        value
                    }
                ];
            }

            case 0x20: {
                // Chorus type: 2 bytes MSB, LSB
                if (syx.length < 9) return unrecognized(syx);
                return [
                    {
                        type: "XG Chorus Param",
                        parameter: "type",
                        value: (value << 8) | syx[7]
                    }
                ];
            }

            case 0x22:
            case 0x23:
            case 0x24:
            case 0x25:
            case 0x26:
            case 0x27:
            case 0x28:
            case 0x29:
            case 0x2a:
            case 0x2b: {
                return [
                    {
                        type: "XG Chorus Param",
                        parameter: a3 - 0x22,
                        value
                    }
                ];
            }

            case 0x2c: {
                return [
                    {
                        type: "XG Chorus Param",
                        parameter: "return",
                        value
                    }
                ];
            }
            case 0x2d: {
                return [
                    {
                        type: "XG Chorus Param",
                        parameter: "pan",
                        value
                    }
                ];
            }
            case 0x2e: {
                return [
                    {
                        type: "XG Chorus Param",
                        parameter: "sendToReverb",
                        value
                    }
                ];
            }

            case 0x30:
            case 0x31:
            case 0x32:
            case 0x33:
            case 0x34:
            case 0x35: {
                return [
                    {
                        type: "XG Chorus Param",
                        parameter: a3 - 0x26, // 0x30 -> 10 ... 0x35 -> 15
                        value
                    }
                ];
            }

            case 0x40: {
                // Variation type: 2 bytes MSB, LSB
                if (syx.length < 9) return unrecognized(syx);
                return [
                    {
                        type: "XG Variation Param",
                        parameter: "type",
                        value: (value << 8) | syx[7]
                    }
                ];
            }

            case 0x42:
            case 0x44:
            case 0x46:
            case 0x48:
            case 0x4a:
            case 0x4c:
            case 0x4e:
            case 0x50:
            case 0x52:
            case 0x54: {
                // Variation params 1-10: 14-bit! Not 16-bit!
                if (syx.length < 9) return unrecognized(syx);
                return [
                    {
                        type: "XG Variation Param",
                        // Bit shift by 1 because address increases by two
                        parameter: (a3 - 0x42) >> 1, // 0x42 -> 0 ... 0x54 -> 9
                        value: (value << 7) | syx[7]
                    }
                ];
            }

            case 0x56: {
                return [
                    {
                        type: "XG Variation Param",
                        parameter: "return",
                        value
                    }
                ];
            }
            case 0x57: {
                return [
                    {
                        type: "XG Variation Param",
                        parameter: "pan",
                        value
                    }
                ];
            }
            case 0x58: {
                return [
                    {
                        type: "XG Variation Param",
                        parameter: "sendToReverb",
                        value
                    }
                ];
            }
            case 0x59: {
                return [
                    {
                        type: "XG Variation Param",
                        parameter: "sendToChorus",
                        value
                    }
                ];
            }
            case 0x5a: {
                // 0 = insertion, 1 = system
                if (value === 0) {
                    return [
                        {
                            type: "XG Variation Param",
                            parameter: "connection",
                            value: "insertion"
                        }
                    ];
                }
                if (value === 1) {
                    return [
                        {
                            type: "XG Variation Param",
                            parameter: "connection",
                            value: "system"
                        }
                    ];
                }
                return unrecognized(syx);
            }
            case 0x5b: {
                return [
                    {
                        type: "XG Variation Param",
                        parameter: "partNumber",
                        value
                    }
                ];
            }

            case 0x70:
            case 0x71:
            case 0x72:
            case 0x73:
            case 0x74:
            case 0x75: {
                return [
                    {
                        type: "XG Variation Param",
                        parameter: a3 - 0x66, // 0x70 -> 10 ... 0x75 -> 15
                        value
                    }
                ];
            }

            default: {
                return unrecognized(syx);
            }
        }
    }

    // XG EFFECT 2 (insertion, a2 = insertion effect number)
    if (a1 === 0x03) {
        const insertionNumber = a2;
        switch (a3) {
            case 0x00: {
                // Insertion type: 2 bytes MSB, LSB
                if (syx.length < 9) return unrecognized(syx);
                return [
                    {
                        type: "XG Insertion Param",
                        insertionNumber,
                        parameter: "type",
                        value: (value << 8) | syx[7]
                    }
                ];
            }

            case 0x02:
            case 0x03:
            case 0x04:
            case 0x05:
            case 0x06:
            case 0x07:
            case 0x08:
            case 0x09:
            case 0x0a:
            case 0x0b: {
                return [
                    {
                        type: "XG Insertion Param",
                        insertionNumber,
                        parameter: a3 - 0x02,
                        value
                    }
                ];
            }

            case 0x0c: {
                return [
                    {
                        type: "XG Insertion Param",
                        insertionNumber,
                        parameter: "partNumber",
                        value
                    }
                ];
            }

            case 0x20:
            case 0x21:
            case 0x22:
            case 0x23:
            case 0x24:
            case 0x25: {
                return [
                    {
                        type: "XG Insertion Param",
                        insertionNumber,
                        parameter: a3 - 0x16, // 0x20 -> 10 ... 0x25 -> 15
                        value
                    }
                ];
            }

            case 0x30:
            case 0x32:
            case 0x34:
            case 0x36:
            case 0x38:
            case 0x3a:
            case 0x3c:
            case 0x3e:
            case 0x40:
            case 0x42: {
                // Insertion params 1-10, full MSB/LSB form (14-bit)
                if (syx.length < 9) return unrecognized(syx);
                return [
                    {
                        type: "XG Insertion Param",
                        insertionNumber,
                        // Bit shift by 1 because address increases by two
                        parameter: (a3 - 0x30) >> 1, // 0x30 -> 0 ... 0x42 -> 9
                        value: (value << 7) | syx[7]
                    }
                ];
            }

            default: {
                return unrecognized(syx);
            }
        }
    }

    // XG MULTI PART
    if (a1 === 0x08 /* A2 is the channel number*/) {
        // The channels here are seen from the first port, the caller adds the sender's port offset
        const channel = xgPartAddress(a2, 0);
        switch (a3) {
            default: {
                return unrecognized(syx);
            }

            case 0x01: {
                // Bank Select MSB
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.bankSelect,
                        value
                    }
                ];
            }

            case 0x02: {
                // Bank Select LSB
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.bankSelectLSB,
                        value
                    }
                ];
            }

            case 0x03: {
                // Program change
                return [
                    {
                        type: "Program Change",
                        channel,
                        value
                    }
                ];
            }

            case 0x04: {
                // Rev. channel
                return [
                    {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "rxChannel",
                        value: xgRxAddress(value, 0)
                    }
                ];
            }

            case 0x05: {
                // Poly/mono
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller:
                            value === 1
                                ? MIDIControllers.polyModeOn
                                : MIDIControllers.monoModeOn,
                        value: 0
                    }
                ];
            }

            case 0x06: {
                // Same Note Number Key On Assign
                return [
                    {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "assignMode",
                        value
                    }
                ];
            }

            case 0x07: {
                // Part mode
                return [
                    {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "drumMap",
                        value
                    }
                ];
            }

            case 0x08: {
                // Note shift
                return [
                    {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "keyShift",
                        value: value - 64
                    }
                ];
            }

            case 0x0b: {
                // Volume
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.mainVolume,
                        value
                    }
                ];
            }

            case 0x0c: {
                // Velocity sense depth
                return [
                    {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "velocitySenseDepth",
                        value
                    }
                ];
            }

            case 0x0d: {
                // Velocity sense offset
                return [
                    {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "velocitySenseOffset",
                        value
                    }
                ];
            }

            case 0x0e: {
                // Pan, except for random,
                // Which is a different parameter
                if (value === 0) {
                    return [
                        {
                            type: "Channel MIDI Param",
                            channel,
                            parameter: "randomPan",
                            value: true
                        }
                    ];
                }
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.pan,
                        value
                    }
                ];
            }

            case 0x11: {
                // Dry level
                return [
                    {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "dryLevel",
                        value
                    }
                ];
            }

            case 0x12: {
                // Chorus
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.chorusDepth,
                        value
                    }
                ];
            }

            case 0x13: {
                // Reverb
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.reverbDepth,
                        value
                    }
                ];
            }

            case 0x14: {
                // Variation
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.variationDepth,
                        value
                    }
                ];
            }

            case 0x15: {
                // Vibrato rate
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.vibratoRate,
                        value
                    }
                ];
            }

            case 0x16: {
                // Vibrato depth
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.vibratoDepth,
                        value
                    }
                ];
            }

            case 0x17: {
                // Vibrato delay
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.vibratoDelay,
                        value
                    }
                ];
            }

            case 0x18: {
                // Filter cutoff
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.brightness,
                        value
                    }
                ];
            }

            case 0x19: {
                // Filter resonance
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.filterResonance,
                        value
                    }
                ];
            }

            case 0x1a: {
                // Attack time
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.attackTime,
                        value
                    }
                ];
            }

            case 0x1b: {
                // Decay time
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.decayTime,
                        value
                    }
                ];
            }

            case 0x1c: {
                // Release time
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.releaseTime,
                        value
                    }
                ];
            }

            case 0x20: {
                // MW LFO PMOD Depth (alias to modulation wheel range)
                // Sets the modulation depth range (RPN 5) to value * 5 cents
                const cents = value * 5;
                return [
                    {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "modulationDepth",
                        value: cents
                    }
                ];
            }

            case 0x23: {
                // Bend pitch control (alias to pitch wheel range)
                // A value below the center gives no bend, like 0
                const centeredValue = Math.max(0, Math.min(24, value - 64));
                return [
                    {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "pitchWheelRange",
                        value: centeredValue
                    }
                ];
            }

            case 0x59: {
                // AC1 controller number
                return [
                    {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "cc1",
                        value: value as MIDIController
                    }
                ];
            }

            case 0x60: {
                // AC2 controller number
                return [
                    {
                        type: "Channel MIDI Param",
                        channel,
                        parameter: "cc2",
                        value: value as MIDIController
                    }
                ];
            }

            case 0x67: {
                // Portamento switch
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.portamentoOnOff,
                        value: value === 1 ? 127 : 0
                    }
                ];
            }

            case 0x68: {
                // Portamento time
                return [
                    {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.portamentoTime,
                        value
                    }
                ];
            }
        }
    }

    // Drum part setup
    if (a1 >> 4 === 3) {
        const drumMap = (a1 & 0xf) + DEFAULT_XG_DRUM_MAP;
        switch (a3) {
            // Pitch coarse
            case 0x00: {
                return [
                    {
                        type: "Map Drum Setup",
                        key: a2,
                        parameter: "pitchCoarse",
                        value: value - 64,
                        drumMap
                    }
                ];
            }

            // Pitch fine
            case 0x01: {
                return [
                    {
                        type: "Map Drum Setup",
                        key: a2,
                        parameter: "pitchFine",
                        value: value - 64,
                        drumMap
                    }
                ];
            }

            // Level
            case 0x02: {
                return [
                    {
                        type: "Map Drum Setup",
                        key: a2,
                        parameter: "level",
                        value: value,
                        drumMap
                    }
                ];
            }

            // Assign Group
            case 0x03: {
                return [
                    {
                        type: "Map Drum Setup",
                        key: a2,
                        parameter: "assignGroup",
                        value: value,
                        drumMap
                    }
                ];
            }

            // Pan
            case 0x04: {
                return [
                    {
                        type: "Map Drum Setup",
                        key: a2,
                        parameter: "pan",
                        value: value,
                        drumMap
                    }
                ];
            }

            // Reverb Send
            case 0x05: {
                return [
                    {
                        type: "Map Drum Setup",
                        key: a2,
                        parameter: "reverbSend",
                        value: value,
                        drumMap
                    }
                ];
            }

            // Chorus Send
            case 0x06: {
                return [
                    {
                        type: "Map Drum Setup",
                        key: a2,
                        parameter: "chorusSend",
                        value: value,
                        drumMap
                    }
                ];
            }

            // Variation Send
            case 0x07: {
                return [
                    {
                        type: "Map Drum Setup",
                        key: a2,
                        parameter: "variationSend",
                        value: value,
                        drumMap
                    }
                ];
            }

            // Rev Note Off
            case 0x09: {
                return [
                    {
                        type: "Map Drum Setup",
                        key: a2,
                        parameter: "rxNoteOff",
                        value: value === 1,
                        drumMap
                    }
                ];
            }

            // Rev Note On
            case 0x0a: {
                return [
                    {
                        type: "Map Drum Setup",
                        key: a2,
                        parameter: "rxNoteOn",
                        value: value === 1,
                        drumMap
                    }
                ];
            }
        }
    }

    return unrecognized(syx);
}

function analyzeGS(syx: SysExAcceptedArray): AnalyzedMessage.SysEx[] {
    if (
        syx.length < 10 ||
        // 0x12: DT1 (Device Transmit)
        syx[3] !== 0x12
    )
        return unrecognized(syx); // Corrupted?

    if (
        // Model ID (Display Data)
        syx[2] === 0x45
    )
        return [{ type: "Display Data" }];

    if (
        // Model ID (GS)
        syx[2] !== 0x42
    )
        return unrecognized(syx);

    // Address
    const a1 = syx[4];
    const a2 = syx[5];
    const a3 = syx[6];
    // Data = syx[7]
    const value = syx[7];

    // System Parameters
    // MODE SET
    // This has been separated from 40 00 because 00 00 05 was erroneously
    // Decoded as "master key shift" even though it means "SC-88 output assign"
    // Testcase: FADED88.mid
    // Both 00 00 7F and 40 00 7F are accepted
    if (a2 === 0x00 && a3 === 0x7f && (a1 === 0x00 || a1 === 0x40)) {
        switch (value) {
            // GS Reset/Mode-1 (Single Module Mode)
            case 0x00:
            // GS Reset/Mode-2 (Double Module Mode)
            case 0x01: {
                return [
                    {
                        type: "Global MIDI Param",
                        parameter: "system",
                        value: "gs"
                    }
                ];
            }

            case 0x7f: {
                // GS Off, default to gm
                return [
                    {
                        type: "Global MIDI Param",
                        parameter: "system",
                        value: "gm"
                    }
                ];
            }
        }
        return unrecognized(syx);
    }

    // Patch common parameters
    if (a1 === 0x40 && a2 === 0x00) {
        switch (a3) {
            // Master Tune
            case 0x00: {
                const tune =
                    (value << 12) | (syx[8] << 8) | (syx[9] << 4) | syx[10];
                const cents = (tune - 1024) / 10;
                return [
                    {
                        type: "Global MIDI Param",
                        parameter: "fineTune",
                        value: cents
                    }
                ];
            }

            // Master Volume
            case 0x04: {
                return [
                    {
                        type: "Global MIDI Param",
                        parameter: "volume",
                        value: value / 127
                    }
                ];
            }

            // Master Key-Shift
            case 0x05: {
                return [
                    {
                        type: "Global MIDI Param",
                        parameter: "keyShift",
                        value: value - 64
                    }
                ];
            }

            // Master Pan
            case 0x06: {
                return [
                    {
                        type: "Global MIDI Param",
                        parameter: "pan",
                        // 63, it ranges from 1 to 127, NOT 0 to 127!
                        value: (value - 64) / 63
                    }
                ];
            }
        }
    }

    // Drum Setup
    if (a1 === 0x41 || a1 === 0x51) {
        const drumMap = (a2 >> 4) + DEFAULT_GS_DRUM_MAP;
        switch (a2 & 0xf) {
            // Play Note Number (Pitch Coarse)
            case 0x1: {
                return [
                    {
                        type: "Map Drum Setup",
                        drumMap,
                        key: a3,
                        parameter: "pitchCoarse",
                        // Semitones, assuming the SC-88 resolution (50 cents per step)
                        value: (value - 60) * 0.5
                    }
                ];
            }

            // Level
            case 0x2: {
                return [
                    {
                        type: "Map Drum Setup",
                        drumMap,
                        key: a3,
                        parameter: "level",
                        value
                    }
                ];
            }

            // Assign Group
            case 0x3: {
                return [
                    {
                        type: "Map Drum Setup",
                        drumMap,
                        key: a3,
                        parameter: "assignGroup",
                        value
                    }
                ];
            }

            // Pan
            case 0x4: {
                return [
                    {
                        type: "Map Drum Setup",
                        drumMap,
                        key: a3,
                        parameter: "pan",
                        value
                    }
                ];
            }

            // Reverb Send
            case 0x5: {
                return [
                    {
                        type: "Map Drum Setup",
                        drumMap,
                        key: a3,
                        parameter: "reverbSend",
                        value
                    }
                ];
            }

            // Chorus Send
            case 0x6: {
                return [
                    {
                        type: "Map Drum Setup",
                        drumMap,
                        key: a3,
                        parameter: "chorusSend",
                        value
                    }
                ];
            }

            // Rx. Note Off
            case 0x7: {
                return [
                    {
                        type: "Map Drum Setup",
                        drumMap,
                        key: a3,
                        parameter: "rxNoteOff",
                        value: value === 1
                    }
                ];
            }

            // Rx. Note On
            case 0x8: {
                return [
                    {
                        type: "Map Drum Setup",
                        drumMap,
                        key: a3,
                        parameter: "rxNoteOn",
                        value: value === 1
                    }
                ];
            }

            // Delay Send Level
            case 0x9: {
                return [
                    {
                        type: "Map Drum Setup",
                        drumMap,
                        key: a3,
                        parameter: "variationSend",
                        value
                    }
                ];
            }
        }
        return unrecognized(syx);
    }

    // User Drum Set
    if (a1 === 0x21) {
        const result = handleSingleUserDrum(a2, a3, value);
        return result ? [result] : unrecognized(syx);
    }

    // User Drum Set Bulk Dump (SC-88 and up)
    // Each packet carries one raw byte per key, starting at key a3
    if (a1 === 0x29) {
        // Packet B is the 12 character name (plus 4 zero bytes), not per key
        if ((a2 & 0x0f) === 0xb) return unrecognized(syx);
        const dataLength = syx.length - 9;
        // Packets 0 to A match the real time parameters, packet 6 holds both Rx flags
        const actualDrumParam = [1, 2, 3, 4, 5, 6, -1, 9, 0xa, 0xb, 0xc][
            a2 & 0x0f
        ];
        if (actualDrumParam === undefined) return unrecognized(syx);
        const analyzed = new Array<AnalyzedMessage.SysEx>();
        for (let i = 0; i < dataLength && a3 + i < 128; i++) {
            const value = syx[i + 7];
            const midiNote = a3 + i;
            if (actualDrumParam === -1) {
                const noteOff = handleSingleUserDrum(
                    (a2 & 0xf0) | 7,
                    midiNote,
                    value & 1
                );
                const noteOn = handleSingleUserDrum(
                    (a2 & 0xf0) | 8,
                    midiNote,
                    (value >> 4) & 1
                );
                if (!noteOff || !noteOn) return unrecognized(syx);
                // Bit 0 is Rx NOTE OFF and bit 4 Rx NOTE ON, bit 3 is internal
                analyzed.push(noteOff, noteOn);
                continue;
            }
            const result = handleSingleUserDrum(
                (a2 & 0xf0) | actualDrumParam,
                midiNote,
                value
            );
            if (!result) return unrecognized(syx);
            analyzed.push(result);
        }
        return analyzed;
    }

    // 0x40 -> Part Parameters, 0x50 -> Part Parameters (BLOCK B) Testcase: 95043-2.KYC.mid
    if (a1 !== 0x40 && a1 !== 0x50) return unrecognized(syx);

    // Effects
    if (a2 === 0x01) {
        switch (a3) {
            default: {
                return unrecognized(syx);
            }
            case 0x30: {
                return [{ type: "GS Reverb Param", parameter: "macro", value }];
            }
            case 0x31: {
                return [
                    {
                        type: "GS Reverb Param",
                        parameter: "character",
                        value
                    }
                ];
            }

            case 0x32: {
                return [
                    {
                        type: "GS Reverb Param",
                        parameter: "preLowpass",
                        value
                    }
                ];
            }

            case 0x33: {
                return [{ type: "GS Reverb Param", parameter: "level", value }];
            }

            case 0x34: {
                return [{ type: "GS Reverb Param", parameter: "time", value }];
            }

            case 0x35: {
                return [
                    {
                        type: "GS Reverb Param",
                        parameter: "delayFeedback",
                        value
                    }
                ];
            }

            // 0x36 is intentionally gone as it was reverb send to chorus in SC-55

            case 0x37: {
                return [
                    {
                        type: "GS Reverb Param",
                        parameter: "preDelayTime",
                        value
                    }
                ];
            }

            case 0x38: {
                return [
                    {
                        type: "GS Chorus Param",
                        parameter: "macro",
                        value
                    }
                ];
            }

            case 0x39: {
                return [
                    {
                        type: "GS Chorus Param",
                        parameter: "preLowpass",
                        value
                    }
                ];
            }

            case 0x3a: {
                return [
                    {
                        type: "GS Chorus Param",
                        parameter: "level",
                        value
                    }
                ];
            }

            case 0x3b: {
                return [
                    {
                        type: "GS Chorus Param",
                        parameter: "feedback",
                        value
                    }
                ];
            }

            case 0x3c: {
                return [
                    {
                        type: "GS Chorus Param",
                        parameter: "delay",
                        value
                    }
                ];
            }

            case 0x3d: {
                return [
                    {
                        type: "GS Chorus Param",
                        parameter: "rate",
                        value
                    }
                ];
            }

            case 0x3e: {
                return [
                    {
                        type: "GS Chorus Param",
                        parameter: "depth",
                        value
                    }
                ];
            }

            case 0x3f: {
                return [
                    {
                        type: "GS Chorus Param",
                        parameter: "sendLevelToReverb",
                        value
                    }
                ];
            }

            case 0x40: {
                return [
                    {
                        type: "GS Chorus Param",
                        parameter: "sendLevelToDelay",
                        value
                    }
                ];
            }

            case 0x50: {
                return [
                    {
                        type: "GS Delay Param",
                        parameter: "macro",
                        value
                    }
                ];
            }

            case 0x51: {
                return [
                    {
                        type: "GS Delay Param",
                        parameter: "preLowpass",
                        value
                    }
                ];
            }

            case 0x52: {
                return [
                    {
                        type: "GS Delay Param",
                        parameter: "timeCenter",
                        value
                    }
                ];
            }

            case 0x53: {
                return [
                    {
                        type: "GS Delay Param",
                        parameter: "timeRatioLeft",
                        value
                    }
                ];
            }

            case 0x54: {
                return [
                    {
                        type: "GS Delay Param",
                        parameter: "timeRatioRight",
                        value
                    }
                ];
            }

            case 0x55: {
                return [
                    {
                        type: "GS Delay Param",
                        parameter: "levelCenter",
                        value
                    }
                ];
            }

            case 0x56: {
                return [
                    {
                        type: "GS Delay Param",
                        parameter: "levelLeft",
                        value
                    }
                ];
            }

            case 0x57: {
                return [
                    {
                        type: "GS Delay Param",
                        parameter: "levelRight",
                        value
                    }
                ];
            }

            case 0x58: {
                return [
                    {
                        type: "GS Delay Param",
                        parameter: "level",
                        value
                    }
                ];
            }

            case 0x59: {
                return [
                    {
                        type: "GS Delay Param",
                        parameter: "feedback",
                        value
                    }
                ];
            }

            case 0x5a: {
                return [
                    {
                        type: "GS Delay Param",
                        parameter: "sendLevelToReverb",
                        value
                    }
                ];
            }
        }
    }

    // Equalizer
    if (a2 === 0x02) {
        const parameter = GS_EQUALIZER_PARAMETER_BY_ADDRESS.get(a3);
        if (parameter === undefined) return unrecognized(syx);
        return [
            {
                type: "GS Equalizer Param",
                parameter,
                value
            }
        ];
    }

    // EFX Parameter
    if (a2 === 0x03) {
        switch (a3) {
            case 0x00: {
                return [
                    {
                        type: "GS Insertion Param",
                        parameter: "type",
                        value: (value << 8) | syx[8]
                    }
                ];
            }
        }

        const named = GS_INSERTION_PARAMETER_BY_ADDRESS.get(a3);
        if (named === "sendEQSwitch") {
            // 0 is off, anything else is on
            return [
                {
                    type: "GS Insertion Param",
                    parameter: named,
                    value: value !== 0
                }
            ];
        }
        if (named !== undefined) {
            return [
                {
                    type: "GS Insertion Param",
                    parameter: named,
                    value
                }
            ];
        }

        if (a3 >= 0x03 && a3 <= 0x16) {
            return [
                {
                    type: "GS Insertion Param",
                    parameter: a3 - 3,
                    value
                }
            ];
        }
        return unrecognized(syx);
    }

    // The channels here are seen from the first port, the caller adds the sender's port offset
    const channel = gsPartAddress(a1, a2 & 0x0f, 0);
    switch (a2 >> 4) {
        // Patch part parameter
        case 1: {
            switch (a3) {
                default: {
                    return unrecognized(syx);
                }

                case 0x00: {
                    // Tone number
                    const bank: AnalyzedMessage.ControllerChange = {
                        type: "Controller Change",
                        channel,
                        controller: MIDIControllers.bankSelect,
                        value
                    };
                    // With a single data byte, syx[8] is the checksum and only the bank is set.
                    // Like every length check here, this counts the closing F7
                    if (syx.length < 11) return [bank];
                    return [
                        bank,
                        {
                            type: "Program Change",
                            channel,
                            value: syx[8]
                        }
                    ];
                }

                case 0x2: {
                    // Rx. channel. 0x10 and anything above it is OFF (verified on hardware)
                    return [
                        {
                            type: "Channel MIDI Param",
                            channel,
                            parameter: "rxChannel",
                            // The raw value, without the block offset (seen from block A)
                            value: gsRxAddress(0x40, value, 0)
                        }
                    ];
                }

                case 0x13: {
                    // Mono/poly
                    return [
                        {
                            type: "Channel MIDI Param",
                            channel,
                            parameter: "polyMode",
                            value: value === 1
                        }
                    ];
                }

                case 0x14: {
                    // Assign mode
                    return [
                        {
                            type: "Channel MIDI Param",
                            channel,
                            parameter: "assignMode",
                            value
                        }
                    ];
                }

                case 0x15: {
                    return [
                        {
                            type: "Channel MIDI Param",
                            channel,
                            parameter: "drumMap",
                            value
                        }
                    ];
                }

                case 0x16: {
                    return [
                        {
                            type: "Channel MIDI Param",
                            channel,
                            parameter: "keyShift",
                            value: value - 64
                        }
                    ];
                }

                case 0x19: {
                    // Part level (cc#7)
                    return [
                        {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.mainVolume,
                            value
                        }
                    ];
                }

                case 0x1a: {
                    // Velocity Sense Depth
                    return [
                        {
                            type: "Channel MIDI Param",
                            channel,
                            parameter: "velocitySenseDepth",
                            value
                        }
                    ];
                }

                case 0x1b: {
                    // Velocity Sense Offset
                    return [
                        {
                            type: "Channel MIDI Param",
                            channel,
                            parameter: "velocitySenseOffset",
                            value
                        }
                    ];
                }

                case 0x1c: {
                    // Pan position, except for random,
                    // Which is a different parameter
                    if (value === 0) {
                        return [
                            {
                                type: "Channel MIDI Param",
                                channel,
                                parameter: "randomPan",
                                value: true
                            }
                        ];
                    }
                    return [
                        {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.pan,
                            value
                        }
                    ];
                }

                case 0x1f: {
                    // CC1 Controller number
                    return [
                        {
                            type: "Channel MIDI Param",
                            channel,
                            parameter: "cc1",
                            value: value as MIDIController
                        }
                    ];
                }

                case 0x20: {
                    // CC2 Controller number
                    return [
                        {
                            type: "Channel MIDI Param",
                            channel,
                            parameter: "cc2",
                            value: value as MIDIController
                        }
                    ];
                }

                case 0x21: {
                    // Chorus send
                    return [
                        {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.chorusDepth,
                            value
                        }
                    ];
                }

                case 0x22: {
                    // Reverb send
                    return [
                        {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.reverbDepth,
                            value
                        }
                    ];
                }

                case 0x2a: {
                    // Fine tune
                    // 0-16384
                    const tune = (value << 7) | syx[8];
                    const tuneCents = (tune - 8192) / 81.92;
                    return [
                        {
                            type: "Channel MIDI Param",
                            channel,
                            parameter: "fineTune",
                            value: tuneCents
                        }
                    ];
                }

                case 0x2c: {
                    // Delay send
                    return [
                        {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.variationDepth,
                            value
                        }
                    ];
                }

                case 0x30: {
                    // Vibrato rate
                    return [
                        {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.vibratoRate,
                            value
                        }
                    ];
                }

                case 0x31: {
                    // Vibrato depth
                    return [
                        {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.vibratoDepth,
                            value
                        }
                    ];
                }

                case 0x32: {
                    // Filter cutoff
                    return [
                        {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.brightness,
                            value
                        }
                    ];
                }

                case 0x33: {
                    // Filter resonance
                    return [
                        {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.filterResonance,
                            value
                        }
                    ];
                }

                case 0x34: {
                    // Attack time
                    return [
                        {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.attackTime,
                            value
                        }
                    ];
                }

                case 0x35: {
                    // Decay time
                    return [
                        {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.decayTime,
                            value
                        }
                    ];
                }

                case 0x36: {
                    // Release time
                    return [
                        {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.releaseTime,
                            value
                        }
                    ];
                }

                case 0x37: {
                    // Vibrato delay
                    return [
                        {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.vibratoDelay,
                            value
                        }
                    ];
                }
            }
        }

        // Patch Part Parameters (Controllers)
        case 2: {
            switch (a3) {
                case 0x04: {
                    // LFO1 Pitch depth
                    // Special case:
                    // If the source is a mod wheel, it's a strange way of setting the modulation depth
                    // Testcase: J-Cycle.mid (it affects gm.dls which uses LFO1 for modulation)
                    // Sets the modulation depth range (RPN 5) to value * 5 cents
                    const cents = value * 5;
                    return [
                        {
                            type: "Channel MIDI Param",
                            parameter: "modulationDepth",
                            channel,
                            value: cents
                        }
                    ];
                }

                case 0x10: {
                    // See https://github.com/spessasus/SpessaSynth/issues/154
                    // Pitch control
                    // Special case:
                    // If the source is a pitch wheel, it's a strange way of setting the pitch wheel range
                    // Testcase: th07_03.mid
                    // A value below the center gives no bend, like 0
                    const centeredValue = Math.max(0, Math.min(24, value - 64));
                    return [
                        {
                            type: "Channel MIDI Param",
                            channel,
                            parameter: "pitchWheelRange",
                            value: centeredValue
                        }
                    ];
                }
            }
            break;
        }

        // Patch Parameter Tone Map
        case 4: {
            switch (a3) {
                default: {
                    return unrecognized(syx);
                }

                // TONE MAP-0 NUMBER (01) is not handled, like in the synth
                case 0x00: {
                    // Tone map number (cc#32)
                    return [
                        {
                            type: "Controller Change",
                            channel,
                            controller: MIDIControllers.bankSelectLSB,
                            value
                        }
                    ];
                }

                case 0x20: {
                    return [
                        {
                            type: "Channel MIDI Param",
                            channel,
                            parameter: "eqEnabled",
                            value: value === 1
                        }
                    ];
                }

                case 0x22: {
                    return [
                        {
                            type: "Channel MIDI Param",
                            channel,
                            parameter: "efxAssign",
                            value: value === 1
                        }
                    ];
                }
            }
        }
    }

    return unrecognized(syx);
}

function handleSingleUserDrum(
    a2: number,
    a3: number,
    data: number
): AnalyzedMessage.SysEx | undefined {
    const drumSet = a2 >> 4;
    // The SC-88 and up have two User Drum Sets
    if (drumSet > 1) return undefined;
    switch (a2 & 0xf) {
        // Play Note
        case 0x1: {
            return {
                type: "User Drum Setup",
                midiNote: a3,
                drumSet,
                parameter: "pitchCoarse",
                value: data - 60
            };
        }

        // Level
        case 0x2: {
            return {
                type: "User Drum Setup",
                midiNote: a3,
                drumSet,
                parameter: "level",
                value: data
            };
        }

        // Assign group
        case 0x3: {
            return {
                type: "User Drum Setup",
                midiNote: a3,
                drumSet,
                parameter: "assignGroup",
                value: data
            };
        }

        // Pan
        case 0x4: {
            return {
                type: "User Drum Setup",
                midiNote: a3,
                drumSet,
                parameter: "pan",
                value: data
            };
        }

        // Reverb Send
        case 0x5: {
            return {
                type: "User Drum Setup",
                midiNote: a3,
                drumSet,
                parameter: "reverbSend",
                value: data
            };
        }

        // Chorus Send
        case 0x6: {
            return {
                type: "User Drum Setup",
                midiNote: a3,
                drumSet,
                parameter: "chorusSend",
                value: data
            };
        }

        // Rx. Note Off
        case 0x7: {
            return {
                type: "User Drum Setup",
                midiNote: a3,
                drumSet,
                parameter: "rxNoteOff",
                value: data === 1
            };
        }

        // Rx. Note On
        case 0x8: {
            return {
                type: "User Drum Setup",
                midiNote: a3,
                drumSet,
                parameter: "rxNoteOn",
                value: data === 1
            };
        }

        // Delay Send Level
        case 0x9: {
            return {
                type: "User Drum Setup",
                midiNote: a3,
                drumSet,
                parameter: "variationSend",
                value: data
            };
        }

        // Source Drum Set Map
        case 0xa: {
            return {
                type: "User Drum Setup",
                midiNote: a3,
                drumSet,
                parameter: "sourceDrumSet",
                value: data
            };
        }

        // Program Number
        case 0xb: {
            return {
                type: "User Drum Setup",
                midiNote: a3,
                drumSet,
                parameter: "program",
                value: data
            };
        }

        // Source Note Number
        case 0xc: {
            return {
                type: "User Drum Setup",
                midiNote: a3,
                drumSet,
                parameter: "sourceNoteNumber",
                value: data
            };
        }
    }
    return undefined;
}
